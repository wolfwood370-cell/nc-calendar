import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/query-keys";
import { toast } from "sonner";
import type { BookingRow, EventTypeRow, ProfileRow } from "@/lib/queries";

/**
 * Modifica inline di un booking dal calendario. Apre un dialog sopra la
 * pagina /trainer/calendar invece di navigare via. Permette di cambiare
 * data/ora, durata, tipo evento, cliente, note e status.
 */
export interface CalendarEventEditDialogProps {
  booking: BookingRow | null;
  clients: ProfileRow[];
  eventTypes: EventTypeRow[];
  coachId: string | undefined;
  onClose: () => void;
}

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CalendarEventEditDialog({
  booking,
  clients,
  eventTypes,
  coachId,
  onClose,
}: CalendarEventEditDialogProps) {
  const qc = useQueryClient();
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMin, setDurationMin] = useState<number>(60);
  const [eventTypeId, setEventTypeId] = useState<string>("none");
  const [clientId, setClientId] = useState<string>("none");
  const [status, setStatus] = useState<string>("scheduled");
  const [trainerNotes, setTrainerNotes] = useState("");
  const [meetingLink, setMeetingLink] = useState("");

  useEffect(() => {
    if (!booking) return;
    setScheduledAt(toLocalDateTimeInput(booking.scheduled_at));
    setDurationMin(booking.duration_min ?? 60);
    setEventTypeId(booking.event_type_id ?? "none");
    setClientId(booking.client_id ?? "none");
    setStatus(booking.status);
    setTrainerNotes(booking.trainer_notes ?? "");
    setMeetingLink(booking.meeting_link ?? "");
  }, [booking]);

  const save = useMutation({
    mutationFn: async () => {
      if (!booking) return;
      const isoStart = new Date(scheduledAt).toISOString();
      const endAt = new Date(
        new Date(scheduledAt).getTime() + durationMin * 60000,
      ).toISOString();
      const patch: Record<string, unknown> = {
        scheduled_at: isoStart,
        end_at: endAt,
        duration_min: durationMin,
        event_type_id: eventTypeId === "none" ? null : eventTypeId,
        client_id: clientId === "none" ? null : clientId,
        status,
        trainer_notes: trainerNotes || null,
        meeting_link: meetingLink || null,
      };
      const { error } = await supabase
        .from("bookings")
        .update(patch)
        .eq("id", booking.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      toast.success("Evento aggiornato");
      onClose();
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!booking) return;
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      toast.success("Evento annullato");
      onClose();
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const open = !!booking;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifica evento</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label htmlFor="cee-when">Data e ora</Label>
            <Input
              id="cee-when"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cee-dur">Durata (min)</Label>
            <Input
              id="cee-dur"
              type="number"
              min={5}
              step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <Label>Stato</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Programmato</SelectItem>
                <SelectItem value="completed">Completato</SelectItem>
                <SelectItem value="cancelled">Annullato</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Tipo evento</Label>
            <Select value={eventTypeId} onValueChange={setEventTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Nessuno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nessuno —</SelectItem>
                {eventTypes.map((et) => (
                  <SelectItem key={et.id} value={et.id}>
                    {et.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Nessuno" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Non assegnato —</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name ?? c.email ?? "Cliente"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cee-link">Link meeting</Label>
            <Input
              id="cee-link"
              type="url"
              value={meetingLink}
              onChange={(e) => setMeetingLink(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="cee-notes">Note coach</Label>
            <Textarea
              id="cee-notes"
              rows={3}
              value={trainerNotes}
              onChange={(e) => setTrainerNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => remove.mutate()}
            disabled={remove.isPending || save.isPending}
          >
            Annulla evento
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>
            Chiudi
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Salvataggio…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
