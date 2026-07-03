// ----------------------------------------------------------------------------
// CoachNotesCard — "Note & obiettivi" con autosave (design handoff)
// ----------------------------------------------------------------------------
// Nota privata + obiettivo del coach sul cliente (tabella coach_client_notes,
// mai visibile al cliente). Autosave con debounce 800ms + indicatore di stato
// (Salvataggio… / Salvato ✓).
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, NotebookPen } from "lucide-react";
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
    <section className="bg-surface-container-lowest rounded-[24px] shadow-soft-blue border border-outline-variant/30 p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-[10px] bg-aura-primary/10 text-aura-primary grid place-items-center">
            <NotebookPen className="size-[18px]" aria-hidden />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-on-surface m-0 leading-tight">
              Note &amp; obiettivi
            </h3>
            <p className="text-xs text-outline m-0">Privati — il cliente non li vede</p>
          </div>
        </div>
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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="coach-goal">Obiettivo</Label>
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
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="coach-note">Nota privata</Label>
        <Textarea
          id="coach-note"
          placeholder="Osservazioni su tecnica, motivazione, infortuni…"
          value={note}
          maxLength={5000}
          rows={4}
          disabled={isLoading}
          onChange={(e) => {
            setNote(e.target.value);
            setDirty(true);
          }}
        />
      </div>
    </section>
  );
}
