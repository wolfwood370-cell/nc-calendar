// ----------------------------------------------------------------------------
// Importa un evento solo su Google, da Integrazioni desktop (passata 09)
// ----------------------------------------------------------------------------
// Lo stesso dialog del pannello di riconciliazione del telefono
// (calendar-gcal-review.tsx): tre modalità, riconoscimento di cliente e
// tipologia dal titolo, stesso payload a gcalImportEvent (gcal-integration.ts).
// Qui nello stile dei dialog del coach (coach-dialog.tsx).
// ----------------------------------------------------------------------------

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Coffee, Loader2, MessageCircle, User, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CoachDialog,
  CoachDialogContent,
  CoachDialogHeader,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import {
  recognizeImport,
  type ImportChoice,
  type ImportMode,
  type ReviewEvent,
} from "@/lib/gcal-integration";
import type { EventTypeRow, ProfileRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

const MODES: Array<{ id: ImportMode; label: string; hint: string; icon: LucideIcon }> = [
  {
    id: "client",
    label: "Sessione di un cliente",
    hint: "Collegata a un cliente per lo storico. Non scala crediti: se serve, gestiscili a parte.",
    icon: User,
  },
  {
    id: "consulenza",
    label: "Consulenza o appuntamento esterno",
    hint: "Per chi non è un cliente registrato. Occupa lo spazio in calendario, nessun credito.",
    icon: MessageCircle,
  },
  {
    id: "personal",
    label: "Impegno personale",
    hint: "Tempo tuo (palestra, pausa…). Non collegato a nessuno.",
    icon: Coffee,
  },
];

const FIELD =
  "h-[42px] rounded-[14px] bg-surface-container-low px-2.5 text-sm text-on-surface outline-none disabled:opacity-60";

export function IntegrationsImportDialog({
  target,
  when,
  clients,
  eventTypes,
  submitting,
  disabled,
  onConfirm,
  onClose,
}: {
  target: ReviewEvent | null;
  /** «ven 25 set · 10:00–11:00». */
  when: string;
  clients: readonly ProfileRow[];
  eventTypes: readonly EventTypeRow[];
  submitting: boolean;
  /** Un'altra scrittura verso Google in corso. */
  disabled: boolean;
  onConfirm: (choice: ImportChoice) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<ImportChoice>({
    mode: "consulenza",
    clientId: "",
    eventTypeId: "",
  });
  // A ogni evento aperto, il riconoscimento dal titolo.
  useEffect(() => {
    if (target) setChoice(recognizeImport(target.summary, eventTypes, clients));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo all'apertura
  }, [target]);

  const set = (patch: Partial<ImportChoice>) => setChoice((c) => ({ ...c, ...patch }));

  return (
    <CoachDialog open={!!target} onOpenChange={(o) => !o && !submitting && onClose()}>
      <CoachDialogContent className="gap-5 sm:max-w-[560px]">
        <CoachDialogHeader
          title="Importa evento da Google"
          description={
            <p className="text-sm text-on-surface-variant">
              {target?.summary || "(senza titolo)"} · {when}
            </p>
          }
        />

        <RadioGroupPrimitive.Root
          value={choice.mode}
          onValueChange={(v) => set({ mode: v as ImportMode })}
          aria-label="Che cos'è questo evento"
          orientation="horizontal"
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
        >
          {MODES.map((m) => {
            const on = m.id === choice.mode;
            return (
              <RadioGroupPrimitive.Item
                key={m.id}
                value={m.id}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-[18px] border-[1.5px] px-3.5 py-3 text-left transition-colors",
                  on
                    ? "border-aura-primary bg-aura-primary/5"
                    : "border-surface-variant bg-surface-container-lowest hover:bg-surface-container-low",
                )}
              >
                <m.icon
                  className={cn("size-[18px]", on ? "text-aura-primary" : "text-outline")}
                  aria-hidden
                />
                <span className="text-sm font-bold text-on-surface">{m.label}</span>
                <span className="text-xs leading-[1.4] text-on-surface-variant">{m.hint}</span>
              </RadioGroupPrimitive.Item>
            );
          })}
        </RadioGroupPrimitive.Root>

        {choice.mode === "client" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-bold text-on-surface">Cliente</span>
              <select
                value={choice.clientId}
                onChange={(e) => set({ clientId: e.target.value })}
                className={FIELD}
              >
                <option value="">Scegli un cliente…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name ?? c.email ?? c.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[13px] font-bold text-on-surface">
                Tipologia di sessione (facoltativa)
              </span>
              <select
                value={choice.eventTypeId}
                onChange={(e) => set({ eventTypeId: e.target.value })}
                className={FIELD}
              >
                <option value="">Predefinita (Sessione PT)</option>
                {eventTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={dialogSecondaryButton}
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => onConfirm(choice)}
            disabled={submitting || disabled}
            className={dialogPrimaryButton}
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {submitting ? "Importo…" : "Importa"}
          </button>
        </div>
      </CoachDialogContent>
    </CoachDialog>
  );
}
