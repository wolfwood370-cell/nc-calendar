// ----------------------------------------------------------------------------
// Il dettaglio della sessione (lato cliente, passata 04, audit D1-D5, O3, O4,
// B2, H9 e V11)
// ----------------------------------------------------------------------------
// La lettura della sessione e della sua tipologia, con la chiave
// ["booking-detail", id] (queryKeys.bookings.detail: le azioni del dettaglio
// la rinfrescano, invalidateBookingScope no). Il coach non si legge: nessuna
// policy di profiles dà al cliente la riga del suo coach, e i testi lo
// prendono da BookCoach (client-booking-detail-view.tsx).
// Gli stati, nell'ordine: la sessione letta e visibile, il dettaglio; letta e
// assente, o eliminata dal coach (isVisibleSession, come in Sessioni), la card
// «Sessione non trovata»; la lettura in errore, la frase e «Riprova»; prima,
// lo scheletro. Una rilettura fallita coi dati di prima tiene il dettaglio.
// ----------------------------------------------------------------------------

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  ClientBookingDetailView,
  type ClientBookingDetail,
} from "@/components/client-booking-detail-view";
import { ClientButton } from "@/components/client-button";
import { ClientPageHeader } from "@/components/client-page-header";
import { AuraCardSkeleton, AuraLineSkeleton } from "@/components/ui/aura-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { isVisibleSession } from "@/lib/client-sessions";
import { clientPageTitle } from "@/lib/client-shell";
import { queryKeys } from "@/lib/query-keys";

export const Route = createFileRoute("/client/bookings/$bookingId")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Sessione") },
      { name: "description", content: "Consulta, sposta o annulla il tuo appuntamento." },
      { property: "og:title", content: clientPageTitle("Sessione") },
      { property: "og:description", content: "Consulta, sposta o annulla il tuo appuntamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BookingDetailPage,
});

const CARD = "flex flex-col gap-3 rounded-[24px] border border-outline-variant/35 bg-white p-5";

function BookingDetailPage() {
  const { bookingId } = Route.useParams();

  const q = useQuery({
    queryKey: queryKeys.bookings.detail(bookingId),
    queryFn: async (): Promise<ClientBookingDetail | null> => {
      const BASE_COLS =
        "id, scheduled_at, status, session_type, trainer_notes, meeting_link, coach_id, client_id, event_type_id, block_id, duration_min, buffer_min, google_event_id, title, category, deleted_at";
      // Design handoff: client_confirmed_at con fallback difensivo finché la
      // migrazione 20260703090000 non è applicata (stesso pattern di queries.ts).
      type BookingDetailRow = Omit<ClientBookingDetail, "event_type">;
      let booking: BookingDetailRow | null;
      const wide = await supabase
        .from("bookings")
        .select(`${BASE_COLS}, client_confirmed_at`)
        .eq("id", bookingId)
        .maybeSingle();
      if (!wide.error) {
        booking = wide.data as unknown as BookingDetailRow | null;
      } else {
        const base = await supabase
          .from("bookings")
          .select(BASE_COLS)
          .eq("id", bookingId)
          .maybeSingle();
        if (base.error) throw base.error;
        booking = base.data
          ? ({ ...base.data, client_confirmed_at: null } as unknown as BookingDetailRow)
          : null;
      }
      if (!booking) return null;

      let eventType: ClientBookingDetail["event_type"] = null;
      if (booking.event_type_id) {
        const etRes = await supabase
          .from("event_types")
          .select("id, name, description, color, location_type, location_address")
          .eq("id", booking.event_type_id)
          .maybeSingle();
        eventType = (etRes.data as ClientBookingDetail["event_type"]) ?? null;
      }
      return { ...booking, event_type: eventType };
    },
  });

  const booking = q.data;
  let content: ReactNode;
  if (booking && isVisibleSession(booking)) {
    content = <ClientBookingDetailView booking={booking} />;
  } else if (booking !== undefined) {
    content = (
      <section className={CARD}>
        <h2 className="text-[17px] font-bold">Sessione non trovata</h2>
        <p className="text-[15px] leading-normal text-on-surface-variant">
          Potrebbe essere stata eliminata.
        </p>
        <ClientButton asChild fullWidth>
          <Link to="/client/sessions">Vai alle sessioni</Link>
        </ClientButton>
      </section>
    );
  } else if (q.isError) {
    // B15 (audit): distingui errore di rete (con retry) da sessione
    // realmente inesistente, invece di mostrare sempre "non trovata".
    content = (
      <section className={CARD}>
        <p className="text-[15px] leading-normal text-on-surface-variant">
          Impossibile caricare la sessione. Controlla la connessione e riprova.
        </p>
        <ClientButton variant="secondary" fullWidth onClick={() => void q.refetch()}>
          Riprova
        </ClientButton>
      </section>
    );
  } else {
    // Audit 2026-05-22 M4: Aura skeletons (rounded-[32px]) match
    // the resolved hero/duration/coach-notes card shapes below
    // so the layout doesn't reflow when data hydrates.
    content = (
      <>
        <AuraCardSkeleton className="h-40 flex flex-col gap-4 p-4">
          <AuraLineSkeleton className="w-2/3" />
          <AuraLineSkeleton className="w-1/2 h-3" />
        </AuraCardSkeleton>
        <AuraCardSkeleton className="h-16 flex items-center gap-3 p-4">
          <AuraLineSkeleton className="w-1/3" />
        </AuraCardSkeleton>
        <AuraCardSkeleton className="h-32 flex flex-col gap-3 p-4">
          <AuraLineSkeleton className="w-3/4" />
          <AuraLineSkeleton className="w-full h-3" />
          <AuraLineSkeleton className="w-5/6 h-3" />
        </AuraCardSkeleton>
      </>
    );
  }

  return (
    <>
      <ClientPageHeader title="Sessione" />
      <div className="flex flex-col gap-4 px-4 pt-2 pb-8">{content}</div>
    </>
  );
}
