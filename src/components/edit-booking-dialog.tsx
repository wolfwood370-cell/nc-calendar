// ----------------------------------------------------------------------------
// EditBookingDialog — coach-side editor for a single booking
// ----------------------------------------------------------------------------
// Extracted from trainer.clients.$id.tsx. Lets the coach reschedule a
// session, change its event type, mark it completed / cancelled, unlink
// it from the client, or delete it everywhere (including Google).
// Parent owns the persistence handlers and passes them as props.
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Unlink, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import type { SessionType } from "@/lib/mock-data";

export type EditableBookingStatus =
  | "scheduled"
  | "completed"
  | "cancelled"
  | "late_cancelled";

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
  status: EditableBookingStatus;
  block_id: string | null;
  prevStatus: string;
  prevEventTypeId: string | null;
  prevSessionType: SessionType;
}

export interface EditBookingDialogProps {
  booking: EditableBooking | null;
  eventTypes: Array<{ id: string; name: string; base_type: SessionType }>;
  onClose: () => void;
  onSave: (input: EditBookingSaveInput) => Promise<void>;
  onUnlink: (b: EditableBooking) => Promise<void>;
  onDeleteEverywhere: (b: EditableBooking) => Promise<void>;
}

export function EditBookingDialog({
  booking,
  eventTypes,
  onClose,
  onSave,
  onUnlink,
  onDeleteEverywhere,
}: EditBookingDialogProps) {
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [eventTypeId, setEventTypeId] = useState<string>("");
  const [status, setStatus] = useState<EditableBookingStatus>("scheduled");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!booking) return;
    const d = parseISO(booking.scheduled_at);
    setDate(format(d, "yyyy-MM-dd"));
    setTime(format(d, "HH:mm"));
    setEventTypeId(booking.event_type_id ?? "");
    const s = booking.status as EditableBookingStatus;
    setStatus(
      ["scheduled", "completed", "cancelled", "late_cancelled"].includes(s) ? s : "scheduled",
    );
  }, [booking]);

  if (!booking) return null;

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
        status,
        block_id: booking.block_id,
        prevStatus: booking.status,
        prevEventTypeId: booking.event_type_id,
        prevSessionType: booking.session_type,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifica Sessione</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
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
            <Label className="text-xs">Tipologia Evento</Label>
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
          <div className="space-y-1">
            <Label className="text-xs">Stato Sessione</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EditableBookingStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Pianificata</SelectItem>
                <SelectItem value="completed">Completata</SelectItem>
                <SelectItem value="late_cancelled">Cancellata — Addebitata</SelectItem>
                <SelectItem value="cancelled">Cancellata — Rimborsata</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border-t pt-4 mt-2 space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Elimina</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              disabled={saving}
              onClick={async () => {
                if (!booking) return;
                await onUnlink(booking);
              }}
            >
              <Unlink className="size-4" /> Scollega dal Profilo
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={saving}
              onClick={async () => {
                if (!booking) return;
                if (!confirm("Sei sicuro? L'evento verrà eliminato anche da Google Calendar."))
                  return;
                await onDeleteEverywhere(booking);
              }}
            >
              <Trash2 className="size-4" /> Elimina ovunque
            </Button>
          </div>
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
      </DialogContent>
    </Dialog>
  );
}
