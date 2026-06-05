import { createFileRoute } from "@tanstack/react-router";
import { IntegrationCard } from "@/components/integration-card";
import { Calendar, CreditCard, Video, Check } from "lucide-react";

export const Route = createFileRoute("/trainer/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-aura-primary">
          Integrazioni
        </h1>
        <p className="text-sm text-outline mt-1">
          Le integrazioni della piattaforma sono gestite centralmente. Tu vedi solo lo stato.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Google Calendar — sempre connesso via Lovable Connector.
            Un unico account Google riceve tutte le scritture dell'app
            (creazione, update, cancel) per tutti i coach. Nessun token
            per-coach in DB. */}
        <IntegrationCard
          accentColor="#4285F4"
          connected={true}
          icon={<Calendar className="size-7" style={{ color: "#4285F4" }} />}
          iconBg="#4285F415"
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
              <Check className="size-4 text-[#4285F4]" /> Promemoria 24h + 30min (online) / 2h (in presenza)
            </li>
          </ul>
          <p className="text-[11px] leading-relaxed tracking-wide text-outline px-1">
            Gestita dal workspace via Lovable Connector — nessuna azione richiesta.
          </p>
        </IntegrationCard>

        {/* Stripe — gestito centralmente via connettore Lovable (chiave
            STRIPE_SECRET_KEY del workspace). Nessun flusso Connect per-coach:
            i checkout Booster passano dall'account Stripe della piattaforma. */}
        <IntegrationCard
          accentColor="#635BFF"
          connected={true}
          icon={<CreditCard className="size-7" style={{ color: "#635BFF" }} />}
          iconBg="#635BFF15"
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
          icon={<Video className="size-7" style={{ color: "#00897B" }} />}
          iconBg="#00897B15"
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
