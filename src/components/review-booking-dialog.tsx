// ----------------------------------------------------------------------------
// Global ReviewBookingDialog (P4 of the sync overhaul)
// ----------------------------------------------------------------------------
// One dialog component, mounted at the /trainer layout level. Driven by the
// URL search param `?reviewEventId=<booking-uuid>`, so any route — Calendar,
// Dashboard, Mobile, Clients — can open it by navigating with that param.
// Closing the dialog clears the param.
//
// Replaces the two inline assign flows that previously lived in
// trainer.calendar.tsx (timed-grid Assign Dialog) and trainer.index.tsx
// (Centro Revisione card). Both call sites now just navigate with the
// search param.
//
// Actions:
//   - Assign to client: UPDATE bookings.client_id = <selected>
//   - Mark Personale  : RPC mark_booking_special(booking_id, 'personal')
//   - Mark Consulenza : RPC mark_booking_special(booking_id, 'consulenza')
//
// The RPC handles credit refund + clearing of links atomically server-side
// (see supabase/migrations/20260520100000_bookings_category_special.sql),
// so we don't have to worry about leaking allocations from the client.
// ----------------------------------------------------------------------------

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCoachClients } from "@/lib/queries";
import { invalidateBookingScope, queryKeys } from "@/lib/query-keys";

interface ReviewBookingDialogProps {
  /** Booking id pulled from `?reviewEventId=`; null = closed. */
  bookingId: string | null;
  /** Called to clear the URL search param when the dialog closes. */
  onClose: () => void;
}

interface ReviewBooking {
  id: string;
  coach_id: string;
  client_id: string | null;
  scheduled_at: string;
  title: string | null;
  notes: string | null;
}

export function ReviewBookingDialog({ bookingId, onClose }: ReviewBookingDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const clientsQ = useCoachClients(user?.id);
  const clients = clientsQ.data ?? [];
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // Reset the local select whenever a new booking opens.
  useEffect(() => {
    if (bookingId) setSelectedClientId("");
  }, [bookingId]);

  const bookingQ = useQuery<ReviewBooking | null>({
    queryKey: ["review-booking", bookingId],
    enabled: !!bookingId,
    queryFn: async (): Promise<ReviewBooking | null> => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, coach_id, client_id, scheduled_at, title, notes")
        .eq("id", bookingId!)
        .maybeSingle();
      if (error) throw error;
      return (data as ReviewBooking | null) ?? null;
    },
  });

  const invalidateScope = (clientId?: string | null) => {
    invalidateBookingScope(qc, {
      coachId: user?.id ?? null,
      clientId: clientId ?? null,
    });
    qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user?.id) });
  };

  const assignBooking = useMutation({
    mutationFn: async (clientId: string) => {
      if (!bookingId) throw new Error("No booking");
      const { error } = await supabase
        .from("bookings")
        .update({ client_id: clientId })
        .eq("id", bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sessione assegnata");
      invalidateScope(selectedClientId);
      onClose();
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const markSpecial = useMutation({
    mutationFn: async (category: "personal" | "consulenza") => {
      if (!bookingId) throw new Error("No booking");
      // Calls the SECURITY DEFINER RPC that:
      //   1. Refunds any credit consumed against block_allocations or
      //      extra_credits (atomic with the booking update).
      //   2. Sets is_personal=true + category=<chosen> + clears
      //      client_id / block_id / event_type_id.
      // RPC re-checks coach ownership server-side, so a malicious
      // client can't mark someone else's booking.
      const { error } = await supabase.rpc("mark_booking_special", {
        p_booking_id: bookingId,
        p_category: category,
      });
      if (error) throw error;
      return category;
    },
    onSuccess: (category) => {
      toast.success(
        category === "consulenza" ? "Consulenza segnata" : "Impegno personale segnato",
      );
      invalidateScope(null);
      onClose();
    },
    onError: (e: Error) => {
      // The migration race: the RPC may not exist yet on this project.
      // Surface a friendlier message instead of the raw Postgres error.
      const message = /function .* does not exist/i.test(e.message)
        ? "Aggiornamento DB necessario: applica la migration mark_booking_special."
        : e.message;
      toast.error("Errore", { description: message });
    },
  });

  const open = !!bookingId;
  const booking = bookingQ.data ?? null;

  const headerLabel = useMemo(() => {
    if (!booking) return "";
    const title = booking.title?.trim();
    if (title) return title;
    const notes = booking.notes?.replace(/^Importato da Google Calendar:\s*/i, "").trim();
    return notes || "Evento da revisionare";
  }, [booking]);

  const dateLabel = useMemo(() => {
    if (!booking?.scheduled_at) return "";
    return new Date(booking.scheduled_at).toLocaleString("it-IT", {
      dateStyle: "full",
      timeStyle: "short",
    });
  }, [booking]);

  const anyPending = assignBooking.isPending || markSpecial.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revisiona evento</DialogTitle>
          <DialogDescription>
            {booking ? `${headerLabel} · ${dateLabel}` : bookingQ.isLoading ? "Caricamento…" : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Assign to client */}
        <div className="space-y-3">
          <Select value={selectedClientId} onValueChange={setSelectedClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona cliente…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name ?? c.email ?? "Cliente"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2 text-xs text-outline">
            <div className="h-px flex-1 bg-outline-variant/40" aria-hidden />
            oppure segna come
            <div className="h-px flex-1 bg-outline-variant/40" aria-hidden />
          </div>

          {/* Special category buttons — both call the same RPC with a
              different category arg. The RPC guarantees credit refund
              before clearing the links, so flagging an already-matched
              event as personal/consulenza never leaks an allocation. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={anyPending}
              onClick={() => markSpecial.mutate("personal")}
            >
              {markSpecial.isPending && markSpecial.variables === "personal" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Impegno Personale
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={anyPending}
              onClick={() => markSpecial.mutate("consulenza")}
            >
              {markSpecial.isPending && markSpecial.variables === "consulenza" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Consulenza
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Annulla
          </Button>
          <Button
            disabled={!selectedClientId || anyPending}
            onClick={() => selectedClientId && assignBooking.mutate(selectedClientId)}
          >
            {assignBooking.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Assegna al cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
