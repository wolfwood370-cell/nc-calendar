// ----------------------------------------------------------------------------
// La bozza dell'orario settimanale, per il desktop e per il telefono
// ----------------------------------------------------------------------------
// Spostata qui da availability-desktop.tsx (passata 08) nella passata 11 del
// lato cliente, senza cambiarla, perché la usi anche il telefono:
//   - la bozza nasce solo da una lettura fatta dopo l'apertura della pagina,
//     non dalla cache; finché non la modifichi si riallinea alle letture nuove
//     (anche dopo un «Ripristina» fatto dall'altra pagina); da quando la
//     modifichi una rilettura in background non la sovrascrive più;
//   - se la lettura fallisce `readFailed` lo dice, e non c'è niente da
//     salvare: salvare una settimana vuota cancellerebbe tutti gli orari;
//   - il salvataggio passa da saveWeek (availability-actions.ts), una
//     scrittura alla volta anche fra le due pagine.
// Prima il telefono idratava la bozza una volta sola, anche dalla cache, e
// una lettura fallita sembrava una settimana vuota.
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { WeekSaveIncompleteError, saveWeek, slotsOfRows } from "@/lib/availability-actions";
import { supabaseAvailabilityStore } from "@/lib/availability-store";
import {
  changedDays,
  dirtyLabel,
  weekErrors,
  weekFromRows,
  weekSlots,
  type Dow,
  type WeekDraft,
} from "@/lib/availability-week";
import { useCoachAvailability, type AvailabilityRow } from "@/lib/queries";
import { toastWithUndo } from "@/lib/toast";
import { errorMessage } from "@/lib/utils";

// Una scrittura dell'orario alla volta, anche fra «Ripristina» di un toast e
// «Salva orari» (e fra due montaggi della pagina, o fra il telefono e il
// desktop): saveWeek rilegge e poi scrive, e due giri intrecciati lascerebbero
// nel database le due settimane insieme.
let weekWrites: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const run = weekWrites.then(task, task);
  weekWrites = run.catch(() => undefined);
  return run;
}

function sortRows(rows: readonly AvailabilityRow[]): AvailabilityRow[] {
  return [...rows].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
  );
}

export interface AvailabilityDraft {
  /** La settimana mostrata: la bozza, o il salvato; null finché non è letta. */
  week: WeekDraft | null;
  /** La lettura è fallita e non c'è un dato fresco: niente da mostrare né da salvare. */
  readFailed: boolean;
  retry: () => void;
  errors: Partial<Record<Dow, string>>;
  withErrors: boolean;
  dirty: boolean;
  dirtyText: string;
  saving: boolean;
  edit: (next: (w: WeekDraft) => WeekDraft) => void;
  save: () => Promise<boolean>;
  discard: () => void;
}

export function useAvailabilityDraft(meId: string | undefined): AvailabilityDraft {
  const qc = useQueryClient();
  const availabilityKey = useMemo(() => ["trainer_availability", meId], [meId]);
  const availQ = useCoachAvailability(meId, { fresh: true });
  const [openedAt] = useState(() => Date.now());
  // Solo una lettura fatta dopo l'apertura: la cache può essere vecchia di
  // minuti, e una rilettura fallita lascia in cache il dato di prima.
  const fresh =
    availQ.isFetchedAfterMount && availQ.data !== undefined && availQ.dataUpdatedAt >= openedAt;
  const saved = useMemo(
    () => (fresh && availQ.data ? weekFromRows(availQ.data) : null),
    [fresh, availQ.data],
  );
  // Con una rilettura in corso restano gli scheletri: lo stato d'errore di
  // prima non è ancora la risposta.
  const readFailed = !fresh && availQ.isError && availQ.fetchStatus === "idle";

  const [edits, setEdits] = useState<WeekDraft | null>(null);
  const week = edits ?? saved;
  const errors = useMemo(() => (week ? weekErrors(week) : {}), [week]);
  const withErrors = Object.keys(errors).length > 0;
  const changed = saved && edits ? changedDays(saved, edits) : [];
  const dirty = changed.length > 0;
  const dirtyText = dirtyLabel(changed.length, withErrors);
  // Scritture in corso (salvataggio o «Ripristina»): barra e card ferme.
  const [pending, setPending] = useState(0);
  const saving = pending > 0;
  const savingRef = useRef(false);

  function edit(next: (w: WeekDraft) => WeekDraft) {
    if (!saved) return;
    // Una bozza tornata uguale al salvato torna a seguire le letture nuove.
    setEdits((prev) => {
      const w = next(prev ?? saved);
      return changedDays(saved, w).length === 0 ? null : w;
    });
  }

  function applyRows(rows: readonly AvailabilityRow[]) {
    qc.setQueryData(availabilityKey, sortRows(rows));
  }

  async function track<T>(task: () => Promise<T>): Promise<T> {
    setPending((n) => n + 1);
    try {
      return await oneAtATime(task);
    } finally {
      setPending((n) => n - 1);
    }
  }

  async function undoSave(before: AvailabilityRow[]) {
    if (!meId) return;
    try {
      const res = await track(() => saveWeek(supabaseAvailabilityStore, meId, slotsOfRows(before)));
      applyRows(res.after);
      toast.success("Orari di prima ripristinati.");
    } catch (e) {
      if (e instanceof WeekSaveIncompleteError) applyRows(e.actual);
      toast.error(errorMessage(e));
    } finally {
      void qc.invalidateQueries({ queryKey: availabilityKey });
    }
  }

  async function save(): Promise<boolean> {
    if (!meId || !edits || withErrors || saving || savingRef.current) return false;
    savingRef.current = true;
    try {
      const target = weekSlots(edits);
      const res = await track(() => saveWeek(supabaseAvailabilityStore, meId, target));
      applyRows(res.after);
      setEdits(null);
      toastWithUndo("Orari salvati. I clienti vedono i nuovi slot.", () => {
        void undoSave(res.before);
      });
      return true;
    } catch (e) {
      // Salvataggio a metà: il salvato diventa quello che il database ha
      // davvero, la bozza resta quella da salvare, e il prossimo salvataggio
      // toglie le righe vecchie.
      if (e instanceof WeekSaveIncompleteError) applyRows(e.actual);
      toast.error(errorMessage(e));
      return false;
    } finally {
      savingRef.current = false;
      void qc.invalidateQueries({ queryKey: availabilityKey });
    }
  }

  return {
    week,
    readFailed,
    retry: () => void availQ.refetch(),
    errors,
    withErrors,
    dirty,
    dirtyText,
    saving,
    edit,
    save,
    discard: () => setEdits(null),
  };
}
