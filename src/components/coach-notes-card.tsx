// ----------------------------------------------------------------------------
// CoachNotesCard — "Note & obiettivi" con autosave (design handoff)
// ----------------------------------------------------------------------------
// Nota privata + obiettivo del coach sul cliente (tabella coach_client_notes,
// mai visibile al cliente). Autosave con debounce 800ms + indicatore di stato
// (Salvataggio… / Salvato ✓).
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Target, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCoachClientNote, useSaveCoachClientNote } from "@/hooks/use-coach-notes";

export function CoachNotesCard({ coachId, clientId }: { coachId: string; clientId: string }) {
  const { data: saved, isLoading } = useCoachClientNote(coachId, clientId);
  const saveMut = useSaveCoachClientNote();

  const [note, setNote] = useState("");
  const [goal, setGoal] = useState("");
  const [dirty, setDirty] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const hydrated = useRef(false);
  const timer = useRef<number | null>(null);

  // Idrata i campi UNA volta al primo load (autosave successivi non devono
  // sovrascrivere ciò che il coach sta digitando).
  useEffect(() => {
    if (hydrated.current || isLoading) return;
    hydrated.current = true;
    setNote(saved?.note ?? "");
    setGoal(saved?.goal ?? "");
  }, [saved, isLoading]);

  // Debounce 800ms su ogni modifica.
  useEffect(() => {
    if (!dirty) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveMut.mutate(
        { coach_id: coachId, client_id: clientId, note, goal },
        {
          onSuccess: () => {
            setDirty(false);
            setSavedTick(true);
            window.setTimeout(() => setSavedTick(false), 2000);
          },
        },
      );
    }, 800);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // saveMut è stabile (useMutation); note/goal/dirty guidano il debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, goal, dirty, coachId, clientId]);

  return (
    <section className="bg-surface-container-lowest rounded-[28px] shadow-soft-blue p-6 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xl font-semibold text-on-surface m-0 leading-tight">
          Note &amp; obiettivi
        </h3>
        <span className="text-xs font-medium text-outline inline-flex items-center gap-1.5">
          {saveMut.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Salvataggio…
            </>
          ) : savedTick ? (
            <span className="inline-flex items-center gap-1 text-success-strong">
              <Check className="size-3.5" aria-hidden /> Salvato
            </span>
          ) : null}
        </span>
      </div>

      {/* Chip Obiettivo (mock): icona target + label uppercase + valore editabile */}
      <div className="flex items-start gap-2.5 bg-surface rounded-2xl px-3.5 py-3">
        <Target className="size-4 shrink-0 mt-0.5 text-aura-primary" aria-hidden />
        <div className="flex-1 min-w-0">
          <Label
            htmlFor="coach-goal"
            className="text-[11px] font-normal uppercase tracking-[0.05em] text-outline"
          >
            Obiettivo
          </Label>
          <Input
            id="coach-goal"
            placeholder="Es. Ricomposizione corporea, -4% grasso"
            value={goal}
            maxLength={500}
            disabled={isLoading}
            onChange={(e) => {
              setGoal(e.target.value);
              setDirty(true);
            }}
            className="mt-0.5 h-auto rounded-none border-0 bg-transparent p-0 shadow-none text-sm font-semibold text-on-surface placeholder:font-normal focus-visible:ring-0"
          />
        </div>
      </div>

      {/* Chip Limitazioni: campo non ancora nei dati — variante neutra del mock */}
      <div className="flex items-start gap-2.5 bg-surface rounded-2xl px-3.5 py-3">
        <TriangleAlert className="size-4 shrink-0 mt-0.5 text-outline" aria-hidden />
        <div>
          <p className="text-[11px] uppercase tracking-[0.05em] text-outline m-0">Limitazioni</p>
          <p className="m-0 mt-0.5 text-sm font-semibold text-on-surface">—</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="coach-note" className="sr-only">
          Nota privata
        </Label>
        <Textarea
          id="coach-note"
          placeholder="Note private del coach…"
          value={note}
          maxLength={5000}
          rows={4}
          disabled={isLoading}
          onChange={(e) => {
            setNote(e.target.value);
            setDirty(true);
          }}
          className="min-h-[80px] rounded-2xl border-surface-variant px-3.5 py-3 text-[13px]"
        />
      </div>
    </section>
  );
}
