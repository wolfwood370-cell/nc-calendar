// ----------------------------------------------------------------------------
// Annulla o elimina sessione — dialog condiviso (passata 02, audit O1)
// ----------------------------------------------------------------------------
// Un solo dialog per Calendario e Profilo, tre varianti:
//   - Annulla sessione: la sessione non si terrà e resta nello storico. A 24
//     ore o meno dall'inizio il coach sceglie se restituire o addebitare il
//     credito (regola in lib/cancel-session.ts).
//   - Elimina sessione: solo per sessioni inserite per errore; sparisce da
//     calendario, storico e Google Calendar e non conta per crediti.
//   - Impegno personale (o evento senza cliente): si elimina.
// Riferimento: design_handoff_coach_redesign/designs/Coach Annulla Sessione.dc.html.
// ----------------------------------------------------------------------------

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CoachAlertDialog,
  CoachAlertDialogCancel,
  CoachAlertDialogContent,
  CoachAlertDialogDescription,
  CoachAlertDialogTitle,
  dialogDangerButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import {
  asksCreditChoice,
  getCancelTiming,
  hasClientCredit,
  removeSession,
  restoreSession,
  type CreditChoice,
  type RemoveSessionResult,
  type SessionRemoval,
} from "@/lib/cancel-session";
import { invalidateBookingScope, queryKeys } from "@/lib/query-keys";
import { supabaseSessionStore } from "@/lib/session-store";
import { formatLongDay, formatTimeRange } from "@/lib/session-time";
import { toastWithUndo } from "@/lib/toast";
import { cn, errorMessage } from "@/lib/utils";

/** Campi della sessione che il dialog legge. */
export interface CancelDialogSession {
  id: string;
  scheduled_at: string;
  duration_min: number | null;
  client_id: string | null;
  coach_id: string | null;
  is_personal: boolean | null;
  title: string | null;
}

export interface SessionCancelDialogProps {
  /** Sessione da annullare o eliminare; null = dialog chiuso. */
  session: CancelDialogSession | null;
  removal: SessionRemoval;
  clientName?: string | null;
  typeName?: string | null;
  onClose: () => void;
  /** Dopo un annullamento, un'eliminazione o un ripristino riusciti. */
  onChanged?: () => void;
}

const CHOICES: Array<{ value: CreditChoice; label: string; hint: string }> = [
  {
    value: "refund",
    label: "Restituisci il credito",
    hint: "Annulli tu o per un motivo valido del cliente.",
  },
  {
    value: "charge",
    label: "Addebita il credito",
    hint: "Cancellazione tardiva: la sessione conta come usata.",
  },
];

function doneMessage(r: RemoveSessionResult, personal: boolean): string {
  if (personal) return "Impegno eliminato.";
  if (r.removal === "delete") return "Sessione eliminata.";
  if (r.credit === "refunded") return "Sessione annullata, credito restituito.";
  if (r.credit === "charged") return "Sessione annullata, credito addebitato.";
  return "Sessione annullata.";
}

export function SessionCancelDialog({
  session,
  removal,
  clientName,
  typeName,
  onClose,
  onChanged,
}: SessionCancelDialogProps) {
  const qc = useQueryClient();
  const [choice, setChoice] = useState<CreditChoice>("refund");
  const [pending, setPending] = useState(false);

  // «Restituisci» è la scelta predefinita a ogni apertura. Dipende dall'id e
  // non dall'oggetto, che il chiamante può ricreare a ogni render: la scelta
  // del coach non deve tornare indietro da sola.
  const sessionId = session?.id ?? null;
  useEffect(() => {
    setChoice("refund");
  }, [sessionId]);

  if (!session) {
    return <CoachAlertDialog open={false} />;
  }

  const personal = !hasClientCredit({
    client_id: session.client_id,
    coach_id: session.coach_id ?? "",
    is_personal: !!session.is_personal,
  });
  // Un impegno o un evento senza cliente si elimina: non ha crediti né storico.
  const effectiveRemoval: SessionRemoval = personal ? "delete" : removal;
  const start = new Date(session.scheduled_at);
  const timing = getCancelTiming(session.scheduled_at);
  const askCharge = effectiveRemoval === "cancel" && asksCreditChoice(timing);
  const of = clientName ? ` di ${clientName}` : "";

  const when = [
    formatLongDay(start),
    formatTimeRange(start, session.duration_min),
    ...(typeName ? [typeName] : []),
  ].join(" · ");

  let title: string;
  let body: string;
  let cta: string;
  if (personal) {
    title = `Eliminare l'impegno «${session.title?.trim() || "Impegno"}»?`;
    body =
      "Lo slot torna libero per le prenotazioni. L'evento viene rimosso anche da Google Calendar.";
    cta = "Elimina impegno";
  } else if (effectiveRemoval === "delete") {
    title = `Eliminare la sessione${of}?`;
    body =
      "Usa questa azione solo per sessioni inserite per errore: sparisce da calendario, storico e Google Calendar, e non conta per crediti e presenza. Se la sessione semplicemente non si terrà, annullala.";
    cta = "Elimina sessione";
  } else {
    title = `Annullare la sessione${of}?`;
    body = askCharge
      ? `${timing === "started" ? "La sessione è già iniziata o passata." : "Mancano meno di 24 ore."} Scegli cosa fare con il credito: l'evento viene comunque rimosso da Google Calendar.`
      : `Il credito torna disponibile${clientName ? ` per ${clientName}` : ""} e l'evento viene rimosso da Google Calendar. Nello storico resta come «Annullata».`;
    cta = "Annulla sessione";
  }

  const scope = { coachId: session.coach_id, clientId: session.client_id };
  const refresh = () => {
    invalidateBookingScope(qc, scope);
    qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(scope.coachId) });
    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(scope.coachId) });
    onChanged?.();
  };

  const undo = async (result: RemoveSessionResult) => {
    try {
      const r = await restoreSession(supabaseSessionStore, result);
      if (r.googleEventRecreated === false) {
        toast.warning("Sessione ripristinata, ma l'evento Google non è stato ricreato.", {
          description: personal
            ? "Ricrealo a mano su Google Calendar."
            : "Si ricrea alla prossima apertura del Calendario.",
        });
      } else {
        toast.success(personal ? "Impegno ripristinato." : "Sessione ripristinata.");
      }
    } catch (e) {
      toast.error("Ripristino non riuscito", { description: errorMessage(e) });
    } finally {
      refresh();
    }
  };

  const confirm = async () => {
    setPending(true);
    try {
      const result = await removeSession(supabaseSessionStore, {
        sessionId: session.id,
        removal: effectiveRemoval,
        choice,
      });
      onClose();
      toastWithUndo(doneMessage(result, personal), () => void undo(result));
      if (result.credit === "failed") {
        toast.error("Il credito non è stato restituito.", {
          description: "Usa «Ripristina» e riprova.",
        });
      }
      if (result.googleEventId && !result.googleEventDeleted) {
        toast.warning("L'evento non è stato rimosso da Google Calendar.", {
          description: "Toglilo a mano da Google Calendar.",
        });
      }
      refresh();
    } catch (e) {
      toast.error(
        effectiveRemoval === "delete" ? "Eliminazione non riuscita" : "Annullamento non riuscito",
        { description: errorMessage(e) },
      );
      refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <CoachAlertDialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <CoachAlertDialogContent>
        <CoachAlertDialogTitle>{title}</CoachAlertDialogTitle>
        <p className="text-sm font-semibold text-on-surface-variant">{when}</p>
        <CoachAlertDialogDescription className="text-sm leading-normal text-on-surface-variant">
          {body}
        </CoachAlertDialogDescription>
        {askCharge && (
          <RadioGroupPrimitive.Root
            value={choice}
            onValueChange={(v) => setChoice(v as CreditChoice)}
            aria-label="Credito"
            className="flex flex-col gap-2"
          >
            {CHOICES.map((o) => {
              const on = choice === o.value;
              return (
                <RadioGroupPrimitive.Item
                  key={o.value}
                  value={o.value}
                  className={cn(
                    "flex items-start gap-2.5 rounded-2xl border-[1.5px] px-3.5 py-3 text-left transition-colors",
                    on
                      ? "border-aura-primary bg-aura-primary/5"
                      : "border-surface-variant bg-surface-container-lowest hover:bg-surface-container-low",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-px grid size-[18px] shrink-0 place-items-center rounded-full border-2",
                      on ? "border-aura-primary" : "border-outline-variant",
                    )}
                  >
                    <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-aura-primary" />
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <strong className="text-sm text-on-surface">{o.label}</strong>
                    <span className="text-xs leading-[1.4] text-on-surface-variant">{o.hint}</span>
                  </span>
                </RadioGroupPrimitive.Item>
              );
            })}
          </RadioGroupPrimitive.Root>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-0.5">
          <CoachAlertDialogCancel className={dialogSecondaryButton} disabled={pending}>
            Indietro
          </CoachAlertDialogCancel>
          <button
            type="button"
            className={dialogDangerButton}
            onClick={() => void confirm()}
            disabled={pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {cta}
          </button>
        </div>
      </CoachAlertDialogContent>
    </CoachAlertDialog>
  );
}
