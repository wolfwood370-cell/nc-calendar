// ----------------------------------------------------------------------------
// EditBookingDialog — coach-side editor for a single booking
// ----------------------------------------------------------------------------
// Extracted from trainer.clients.$id.tsx. Lets the coach reschedule a
// session, change its event type, mark it completed or unlink it from the
// client. Annullare ed eliminare passano dal dialog condiviso «Annulla o
// elimina sessione» (passata 02): lo stato «annullata» non si sceglie più a
// mano, così il credito segue sempre la stessa regola (lib/cancel-session.ts).
// Parent owns the persistence handlers and passes them as props.
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Unlink, Trash2, Loader2, Save, Ban } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { canCancel } from "@/lib/cancel-session";
import type { SessionType } from "@/lib/mock-data";

export type EditableBookingStatus = "scheduled" | "completed";

// Local copy of the parent's ClientBooking — just the fields the dialog
// reads. Kept loose so a parent shape change doesn't force a dialog
// rewrite.
export interface EditableBooking {
  id: string;
  scheduled_at: string;
  status: string;
  block_id: string | null;
  event_type_id: string | null;
  session_type: SessionType;
}

export interface EditBookingSaveInput {
  id: string;
  scheduled_at: string;
  event_type_id: string | null;
  session_type: SessionType;
  /** Stato da scrivere; null lascia quello attuale (sessioni annullate). */
  status: EditableBookingStatus | null;
}

export interface EditBookingDialogProps {
  booking: EditableBooking | null;
  eventTypes: Array<{ id: string; name: string; base_type: SessionType }>;
  onClose: () => void;
  onSave: (input: EditBookingSaveInput) => Promise<void>;
  onUnlink: (b: EditableBooking) => Promise<void>;
  /** Apre il dialog condiviso per annullare la sessione. */
  onCancelSession: (b: EditableBooking) => void;
  /** Apre il dialog condiviso per eliminarla (sessioni inserite per errore). */
  onDeleteSession: (b: EditableBooking) => void;
}

// Senza «credito restituito»: le sessioni annullate dal Calendario prima della
// passata 02 hanno lo stato `cancelled` ma il credito non è mai tornato.
const CANCELLED_LINE: Record<string, string> = {
  cancelled: "Sessione annullata.",
  late_cancelled: "Sessione annullata, credito addebitato.",
};

export function EditBookingDialog({
  booking,
  eventTypes,
  onClose,
  onSave,
  onUnlink,
  onCancelSession,
  onDeleteSession,
}: EditBookingDialogProps) {
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [eventTypeId, setEventTypeId] = useState<string>("");
  const [status, setStatus] = useState<EditableBookingStatus>("scheduled");
  const [saving, setSaving] = useState(false);
  // T5 (audit): anche lo scollegamento dal profilo si conferma con un
  // AlertDialog (prima era un confirm nativo nel profilo, mai raggiunto).
  const [confirmUnlinkOpen, setConfirmUnlinkOpen] = useState(false);

  useEffect(() => {
    if (!booking) return;
    const d = parseISO(booking.scheduled_at);
    setDate(format(d, "yyyy-MM-dd"));
    setTime(format(d, "HH:mm"));
    setEventTypeId(booking.event_type_id ?? "");
    setStatus(booking.status === "completed" ? "completed" : "scheduled");
  }, [booking]);

  if (!booking) return null;

  const cancelledLine = CANCELLED_LINE[booking.status];
  // Solo programmata e svolta si scelgono qui; assente e annullata restano come sono.
  const statusEditable = booking.status === "scheduled" || booking.status === "completed";

  async function handleSave() {
    if (!booking) return;
    if (!date || !time) {
      toast.error("Data e ora obbligatorie");
      return;
    }
    setSaving(true);
    try {
      const iso = new Date(`${date}T${time}:00`).toISOString();
      const et = eventTypes.find((e) => e.id === eventTypeId);
      await onSave({
        id: booking.id,
        scheduled_at: iso,
        event_type_id: eventTypeId || null,
        session_type: et?.base_type ?? booking.session_type,
        status: statusEditable ? status : null,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifica sessione</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {cancelledLine && (
            <p className="rounded-2xl bg-surface-container-low px-3 py-2.5 text-sm text-on-surface-variant">
              {cancelledLine}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipologia di sessione</Label>
            <Select value={eventTypeId} onValueChange={setEventTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona" />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map((et) => (
                  <SelectItem key={et.id} value={et.id}>
                    {et.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {statusEditable && (
            <div className="space-y-1">
              <Label className="text-xs">Stato sessione</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EditableBookingStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">Pianificata</SelectItem>
                  <SelectItem value="completed">Completata</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="border-t pt-4 mt-2 flex flex-col sm:flex-row flex-wrap gap-2">
          {canCancel(booking.status) && (
            <Button
              variant="outline"
              className="flex-1 border-danger-line bg-danger-soft text-danger-text hover:bg-danger-line/50 hover:text-danger-text"
              disabled={saving}
              onClick={() => onCancelSession(booking)}
            >
              <Ban className="size-4" /> Annulla sessione
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1"
            disabled={saving}
            onClick={() => setConfirmUnlinkOpen(true)}
          >
            <Unlink className="size-4" /> Scollega dal profilo
          </Button>
          <Button
            variant="ghost"
            className="flex-1 text-danger-text hover:text-danger-text"
            disabled={saving}
            onClick={() => onDeleteSession(booking)}
          >
            <Trash2 className="size-4" /> Elimina
          </Button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salva
          </Button>
        </DialogFooter>

        <AlertDialog open={confirmUnlinkOpen} onOpenChange={setConfirmUnlinkOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Scollegare la sessione dal profilo?</AlertDialogTitle>
              <AlertDialogDescription>
                La sessione resta in calendario tra gli eventi da assegnare e non viene più abbinata
                a questo cliente. Se era stato scalato un credito, torna disponibile.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Annulla</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!booking) return;
                  await onUnlink(booking);
                }}
              >
                Scollega
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
