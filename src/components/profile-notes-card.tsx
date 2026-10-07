// ----------------------------------------------------------------------------
// «Note e obiettivi» del Profilo desktop (passata 06)
// ----------------------------------------------------------------------------
// Obiettivo (coach_client_notes.goal) e note private (note, che il cliente
// non legge). Stesso salvataggio di CoachNotesCard (upsert dopo 800 ms di
// pausa, use-coach-notes.ts), con lo stato «Salvataggio automatico» /
// «Salvataggio…» / «Salvato». In più: se si lascia la pagina prima degli
// 800 ms, la modifica si salva lo stesso invece di perdersi.
// Le Limitazioni (K4) non ci sono ancora: la colonna c'è dal giro del server
// del 02/10/2026 (coach_client_notes.limitations, nei tipi dal 04/10), ma la
// pagina non la legge né la scrive; il campo arriva con una passata del
// Profilo.
// ----------------------------------------------------------------------------

import { Target } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCoachClientNote, useSaveCoachClientNote } from "@/hooks/use-coach-notes";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 800;

export function ProfileNotesCard({ coachId, clientId }: { coachId: string; clientId: string }) {
  const { data: saved, isLoading } = useCoachClientNote(coachId, clientId);
  const saveMut = useSaveCoachClientNote();
  const [goal, setGoal] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const hydrated = useRef(false);
  const pending = useRef<{ goal: string; note: string } | null>(null);
  const timer = useRef<number | null>(null);
  const savedTimer = useRef<number | null>(null);
  const saveRef = useRef(saveMut.mutate);
  saveRef.current = saveMut.mutate;

  useEffect(() => {
    if (hydrated.current || isLoading) return;
    hydrated.current = true;
    setGoal(saved?.goal ?? "");
    setNote(saved?.note ?? "");
  }, [saved, isLoading]);

  function flush() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    saveRef.current(
      { coach_id: coachId, client_id: clientId, goal: next.goal, note: next.note },
      {
        onSuccess: () => {
          setState("saved");
          if (savedTimer.current) window.clearTimeout(savedTimer.current);
          savedTimer.current = window.setTimeout(() => setState("idle"), 2000);
        },
        onError: () => setState("idle"),
      },
    );
  }

  function queue(patch: Partial<{ goal: string; note: string }>) {
    const next = { goal, note, ...patch };
    setGoal(next.goal);
    setNote(next.note);
    pending.current = next;
    setState("saving");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, DEBOUNCE_MS);
  }

  // Uscita dalla pagina con una modifica ancora in attesa: si salva subito.
  useEffect(() => {
    return () => {
      if (savedTimer.current) window.clearTimeout(savedTimer.current);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    state === "saving" || saveMut.isPending
      ? "Salvataggio…"
      : state === "saved"
        ? "Salvato"
        : "Salvataggio automatico";

  return (
    <section className="flex flex-col gap-3 rounded-[28px] bg-surface-container-lowest p-6 shadow-soft-blue">
      <div className="flex items-center justify-between gap-3">
        <h2 className="card-title m-0 text-on-surface">Note e obiettivi</h2>
        <span
          role="status"
          className={cn(
            "text-xs font-semibold",
            state === "saved" ? "text-success-text" : "text-outline",
          )}
        >
          {label}
        </span>
      </div>
      <label className="flex items-start gap-2.5 rounded-2xl bg-surface px-3.5 py-3">
        <Target className="mt-0.5 size-4 shrink-0 text-aura-primary" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-outline">
            Obiettivo
          </span>
          <input
            value={goal}
            maxLength={500}
            disabled={isLoading}
            onChange={(e) => queue({ goal: e.target.value })}
            placeholder="Es. Ricomposizione corporea, −4% grasso"
            className="bg-transparent text-sm font-semibold text-on-surface placeholder:font-normal placeholder:text-outline"
          />
        </span>
      </label>
      <textarea
        value={note}
        maxLength={5000}
        rows={4}
        disabled={isLoading}
        onChange={(e) => queue({ note: e.target.value })}
        aria-label="Note private"
        placeholder="Note private: visibili solo a te"
        className="resize-y rounded-2xl border border-surface-variant px-3.5 py-3 text-sm leading-normal outline-none focus:ring-2 focus:ring-primary-container"
      />
    </section>
  );
}
