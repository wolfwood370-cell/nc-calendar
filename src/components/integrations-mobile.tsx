// ----------------------------------------------------------------------------
// Integrazioni sul telefono (passata 09)
// ----------------------------------------------------------------------------
// È la pagina di prima, spostata qui da src/routes/trainer.integrations.tsx
// senza cambiarne l'aspetto: il redesign vale da md in su
// (integrations-desktop.tsx), e la route ne monta una sola.
// ----------------------------------------------------------------------------

import { useMemo } from "react";
import { CalendarGcalReview } from "@/components/calendar-gcal-review";
import { GcalFullSyncButton } from "@/components/gcal-full-sync-button";
import { IntegrationCard } from "@/components/integration-card";
import { PageTitle } from "@/components/page-title";
import { useAuth } from "@/lib/auth";
import { useCoachBookings, useCoachClients, useCoachEventTypes } from "@/lib/queries";
import { Calendar, CreditCard, Video, Check } from "lucide-react";

export function IntegrationsMobile() {
  // Riconciliazione con Google Calendar e sync dal 1° gennaio: spostate qui
  // dal Calendario (passata 04, audit C1), così com'erano.
  const { user } = useAuth();
  const bookingsQ = useCoachBookings(user?.id);
  const clientsQ = useCoachClients(user?.id);
  const eventTypesQ = useCoachEventTypes(user?.id);
  const bookings = bookingsQ.data ?? [];
  const clientsMap = useMemo(
    () => new Map((clientsQ.data ?? []).map((c) => [c.id, c])),
    [clientsQ.data],
  );
  const eventTypesMap = useMemo(
    () => new Map((eventTypesQ.data ?? []).map((e) => [e.id, e])),
    [eventTypesQ.data],
  );

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-6">
      <div>
        <PageTitle>Integrazioni</PageTitle>
        <p className="text-sm text-on-surface-variant mt-1">
          Le integrazioni della piattaforma sono gestite centralmente.{" "}
          {/* contatore statico: le 3 integrazioni sotto sono tutte connected */}
          <span className="font-semibold text-aura-primary">3</span> attive.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {/* Google Calendar — sempre connesso via Lovable Connector.
            Un unico account Google riceve tutte le scritture dell'app
            (creazione, update, cancel) per tutti i coach. Nessun token
            per-coach in DB. */}
        <IntegrationCard
          accentColor="#4285F4"
          connected={true}
          icon={<Calendar className="size-6 text-white" />}
          iconBg="#4285F4"
          title="Google Calendar"
          description="Sincronizzazione attiva con il calendario della piattaforma."
        >
          <ul className="space-y-2 text-sm text-outline">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#4285F4]" /> Eventi creati alla conferma
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#4285F4]" /> Inviti email ai clienti (sendUpdates=all)
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#4285F4]" /> Promemoria 24h + 30min (online) / 2h (in
              presenza)
            </li>
          </ul>
          <p className="text-[11px] leading-relaxed tracking-wide text-outline px-1">
            Gestita dal workspace via Lovable Connector — nessuna azione richiesta.
          </p>
        </IntegrationCard>

        <div>
          {/* Riconciliazione bidirezionale Google <-> app (sola lettura) */}
          <CalendarGcalReview
            coachId={user?.id}
            bookings={bookings}
            clientsMap={clientsMap}
            eventTypesMap={eventTypesMap}
          />
          {/* Sync forzato sull'intero anno corrente */}
          <GcalFullSyncButton coachId={user?.id} />
        </div>

        {/* Stripe — gestito centralmente via connettore Lovable (chiave
            STRIPE_SECRET_KEY del workspace). Nessun flusso Connect per-coach:
            i checkout Booster passano dall'account Stripe della piattaforma. */}
        <IntegrationCard
          accentColor="#635BFF"
          connected={true}
          icon={<CreditCard className="size-6 text-white" />}
          iconBg="#635BFF"
          title="Stripe"
          description="Pagamenti dei Booster gestiti dalla piattaforma."
        >
          <ul className="space-y-2 text-sm text-outline">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#635BFF]" /> Checkout Booster attivo
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#635BFF]" /> Pagamenti carte e wallet
            </li>
          </ul>
          <p className="text-[11px] leading-relaxed tracking-wide text-outline px-1">
            Gestito dal workspace via Lovable Connector — nessuna azione richiesta.
          </p>
        </IntegrationCard>

        {/* Google Meet — informativo: i link Meet vengono creati dal
            connettore Google Calendar quando la sessione è online. */}
        <IntegrationCard
          accentColor="#00897B"
          connected={true}
          icon={<Video className="size-6 text-white" />}
          iconBg="#00897B"
          title="Google Meet"
          description="Link Meet generati automaticamente per le sessioni online."
        >
          <ul className="space-y-2 text-sm text-outline">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#00897B]" /> Link generati in automatico
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#00897B]" /> Inviti integrati al cliente
            </li>
          </ul>
          <p className="text-[11px] leading-relaxed tracking-wide text-outline px-1">
            Incluso nel connettore Google Calendar.
          </p>
        </IntegrationCard>
      </div>
    </div>
  );
}
