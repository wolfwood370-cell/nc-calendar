// ----------------------------------------------------------------------------
// «Modifica sessione» dal Profilo cliente (passata 06, dialog 540px)
// ----------------------------------------------------------------------------
// Stato segmentato Programmata · Svolta · Assente (O1: «Annullata» non si
// sceglie); tipologia a chip, data, ora, note del coach; in basso a sinistra
// «Annulla sessione» e «Elimina» (dialog condiviso della 02) e «Scollega dal
// profilo», che c'era già; a destra «Annulla» e «Salva». Se la sessione è
// annullata: la riga con l'esito del credito e «Rimetti in agenda».
// Le scritture sono quelle del Calendario (profile-session.ts).
// ----------------------------------------------------------------------------

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CoachDialog,
  CoachDialogContent,
  CoachDialogHeader,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { SegmentedControl } from "@/components/segmented-control";
import { canCancel } from "@/lib/cancel-session";
import { localDate, localIso, localTime, timeOptions } from "@/lib/calendar-time";
import { toGoogleColorId } from "@/lib/gcal-colors";
import { sessionLabel } from "@/lib/mock-data";
import type { ProfileBooking } from "@/lib/profile-load";
import {
  canEditTime,
  isOutcome,
  putBackInAgenda,
  saveProfileSession,
  undoProfileSession,
  undoPutBack,
} from "@/lib/profile-session";
import { supabaseProfileStore } from "@/lib/profile-store";
import type { EventTypeRow } from "@/lib/queries";
import { checkEditCredit, snapshotOf } from "@/lib/session-edit";
import type { SessionOutcome } from "@/lib/session-outcome";
import { toastWithUndo } from "@/lib/toast";
import { cn, errorMessage } from "@/lib/utils";

const OUTCOMES: ReadonlyArray<{ value: SessionOutcome; label: string }> = [
  { value: "scheduled", label: "Programmata" },
  { value: "completed", label: "Svolta" },
  { value: "no_show", label: "Assente" },
];

// Come nella 02 (edit-booking-dialog.tsx): per `cancelled` non si scrive
// «credito restituito», perché le sessioni annullate dal Calendario prima
// della 02 hanno quello stato ma il credito non è mai tornato.
const CANCELLED_LINE: Record<string, string> = {
  cancelled: "Sessione annullata.",
  late_cancelled: "Sessione annullata, con credito addebitato.",
};

export interface ProfileSessionDialogProps {
  booking: ProfileBooking | null;
  clientName: string;
  eventTypes: readonly EventTypeRow[];
  onClose: () => void;
  /** Dopo un salvataggio, un ripristino o «Rimetti in agenda». */
  onChanged: () => void;
  onCancelSession: (b: ProfileBooking) => void;
  onDeleteSession: (b: ProfileBooking) => void;
  onUnlink: (b: ProfileBooking) => void;
}

export function ProfileSessionDialog(props: ProfileSessionDialogProps) {
  const { booking, onClose } = props;
  return (
    <CoachDialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      {booking && (
        <CoachDialogContent className="gap-4 sm:max-w-[540px]">
          <Body key={booking.id} {...props} booking={booking} />
        </CoachDialogContent>
      )}
    </CoachDialog>
  );
}

function Body({
  booking,
  clientName,
  eventTypes,
  onClose,
  onChanged,
  onCancelSession,
  onDeleteSession,
  onUnlink,
}: ProfileSessionDialogProps & { booking: ProfileBooking }) {
  const start = new Date(booking.scheduled_at);
  const [status, setStatus] = useState<string>(booking.status);
  const [typeId, setTypeId] = useState<string | null>(booking.event_type_id);
  const [date, setDate] = useState(localDate(start));
  const [time, setTime] = useState(localTime(start));
  const [notes, setNotes] = useState(booking.trainer_notes ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // La sessione com'è adesso sul server: è il punto di partenza di ogni scrittura.
  const currentQ = useQuery({
    queryKey: ["profile-edit-session", booking.id],
    queryFn: () => supabaseProfileStore.getEditableSession(booking.id),
  });
  const current = currentQ.data ?? null;
  const cancelled = booking.status === "cancelled" || booking.status === "late_cancelled";
  const timeEditable = !!current && canEditTime(current.status, status);
  const type = eventTypes.find((t) => t.id === typeId) ?? null;
  const startIso = date && time ? localIso(date, time) : null;

  const retypeQ = useQuery({
    queryKey: ["profile-edit-credit", booking.id, typeId, startIso],
    enabled: !!current && !!type && type.id !== current.event_type_id && !!startIso,
    queryFn: () =>
      checkEditCredit(supabaseProfileStore, current!, {
        scheduledAt: startIso!,
        type: { id: type!.id, name: type!.name, base_type: type!.base_type },
        clientName,
      }),
  });
  const retypeProblem = retypeQ.data ?? null;

  const times = useMemo(() => {
    const list = timeOptions();
    return list.includes(time) ? list : [...list, time].sort();
  }, [time]);

  const summaryOf = (t: EventTypeRow | null | undefined, st: string) =>
    `${t?.name ?? sessionLabel(st as ProfileBooking["session_type"])} — ${clientName}`;

  async function save() {
    if (!current || !startIso) return;
    setSaving(true);
    setProblem(null);
    try {
      const r = await saveProfileSession(supabaseProfileStore, {
        sessionId: current.id,
        expected: snapshotOf(current),
        status,
        scheduledAt: timeEditable ? startIso : current.scheduled_at,
        durationMin: current.duration_min,
        type:
          timeEditable && type ? { id: type.id, name: type.name, base_type: type.base_type } : null,
        clientName,
        notes,
        google: {
          summary: summaryOf(type, current.session_type),
          colorId: toGoogleColorId(type?.color),
        },
      });
      onChanged();
      onClose();
      if (!r.edit && !r.outcome) {
        toast.success("Nessuna modifica da salvare.");
        return;
      }
      const beforeType = eventTypes.find((t) => t.id === current.event_type_id);
      toastWithUndo("Sessione aggiornata.", () => {
        void undoProfileSession(supabaseProfileStore, r, {
          summary: summaryOf(beforeType, current.session_type),
          colorId: toGoogleColorId(beforeType?.color),
        })
          .then(() => {
            onChanged();
            toast.success("Sessione ripristinata.");
          })
          .catch((e: unknown) => toast.error(errorMessage(e)));
      });
      if (r.edit?.refundFailed) {
        toast.error("Il credito della tipologia di prima non è stato restituito.");
      }
      if (r.edit?.googleEventId && !r.edit.googleUpdated) {
        toast.warning("L'evento non è stato aggiornato su Google Calendar.");
      }
    } catch (e) {
      setProblem(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function putBack() {
    setSaving(true);
    setProblem(null);
    try {
      const r = await putBackInAgenda(supabaseProfileStore, booking.id);
      onChanged();
      onClose();
      toastWithUndo("Sessione di nuovo in agenda.", () => {
        void undoPutBack(supabaseProfileStore, r)
          .then(() => {
            onChanged();
            toast.success("La sessione è di nuovo annullata.");
          })
          .catch((e: unknown) => toast.error(errorMessage(e)));
      });
      if (!r.googleEventRecreated) {
        toast.warning("La sessione è in agenda, ma non è su Google Calendar.");
      }
    } catch (e) {
      // Senza credito, o sessione cambiata: il dialog lo dice e non rimette niente.
      setProblem(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <CoachDialogHeader title="Modifica sessione" />

      {cancelled ? (
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl bg-surface-container-low px-3.5 py-3">
          <span className="text-sm font-semibold text-on-surface-variant">
            {CANCELLED_LINE[booking.status]}
          </span>
          <button
            type="button"
            onClick={() => void putBack()}
            disabled={saving}
            className="text-[13px] font-bold text-aura-primary disabled:opacity-60"
          >
            Rimetti in agenda
          </button>
        </div>
      ) : (
        isOutcome(booking.status) && (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-bold text-on-surface">Stato</p>
            <SegmentedControl
              ariaLabel="Stato"
              className="self-start"
              value={status as SessionOutcome}
              onChange={setStatus}
              options={OUTCOMES}
            />
          </div>
        )
      )}

      <div className="flex flex-col gap-2">
        <p id="profile-edit-type" className="text-[13px] font-bold text-on-surface">
          Tipologia di sessione
        </p>
        <RadioGroupPrimitive.Root
          value={typeId ?? ""}
          onValueChange={setTypeId}
          disabled={!timeEditable}
          aria-labelledby="profile-edit-type"
          orientation="horizontal"
          className="flex flex-wrap gap-2"
        >
          {eventTypes.map((t) => {
            const on = t.id === typeId;
            return (
              <RadioGroupPrimitive.Item
                key={t.id}
                value={t.id}
                className={cn(
                  "flex h-[34px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-60",
                  on
                    ? "border-aura-primary bg-aura-primary/[0.08] text-aura-primary"
                    : "border-surface-variant bg-white text-on-surface-variant hover:bg-surface-container-low",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.name}
              </RadioGroupPrimitive.Item>
            );
          })}
        </RadioGroupPrimitive.Root>
      </div>

      <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-on-surface">Data</span>
          <input
            type="date"
            value={date}
            disabled={!timeEditable}
            onChange={(e) => setDate(e.target.value)}
            className="h-[42px] rounded-[14px] bg-surface-container-low px-3 text-sm disabled:opacity-60"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold text-on-surface">Ora</span>
          <select
            value={time}
            disabled={!timeEditable}
            onChange={(e) => setTime(e.target.value)}
            className="h-[42px] rounded-[14px] bg-surface-container-low px-2.5 text-sm disabled:opacity-60"
          >
            {times.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      {current && !timeEditable && (
        <p className="-mt-2 text-xs text-outline">
          {cancelled
            ? "Una sessione annullata cambia solo nelle note: per spostarla, rimettila in agenda."
            : "La sessione non è più programmata: data, ora e tipologia si cambiano riportandola a Programmata."}
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-bold text-on-surface">Note del coach</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Il cliente le vede nel dettaglio della sessione."
          className="resize-y rounded-[14px] bg-surface-container-low px-3.5 py-2.5 text-sm leading-normal outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
        />
      </label>

      {(problem || retypeProblem) && (
        <p
          role="alert"
          className="rounded-[14px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger-text"
        >
          {problem ?? retypeProblem}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {canCancel(booking.status) && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onCancelSession(booking)}
              className="h-10 rounded-full bg-danger-soft px-3.5 text-sm font-semibold text-danger-text transition-colors hover:bg-danger-line/50 disabled:opacity-60"
            >
              Annulla sessione
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={() => onDeleteSession(booking)}
            className="h-10 px-2.5 text-[13px] font-semibold text-danger-text disabled:opacity-60"
          >
            Elimina
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onUnlink(booking)}
            className="h-10 px-2.5 text-[13px] font-semibold text-on-surface-variant disabled:opacity-60"
          >
            Scollega dal profilo
          </button>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className={dialogSecondaryButton}>
            Annulla
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !current || !startIso || !!retypeProblem}
            className={dialogPrimaryButton}
          >
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Salva
          </button>
        </div>
      </div>
    </>
  );
}
