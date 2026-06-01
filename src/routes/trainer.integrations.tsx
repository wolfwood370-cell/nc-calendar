import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { IntegrationCard } from "@/components/integration-card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Calendar, CreditCard, Video, Loader2, Check } from "lucide-react";

export const Route = createFileRoute("/trainer/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { user } = useAuth();
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  // Stripe connection state driven by integration_settings.stripe_account_id
  // (migration 20260520140000). Non-null = connected.
  const [isStripeConnected, setIsStripeConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("integration_settings")
        .select("stripe_account_id")
        .eq("coach_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setIsStripeConnected(!!(data as { stripe_account_id?: string | null } | null)?.stripe_account_id);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleConnectStripe = async () => {
    setIsStripeLoading(true);
    toast.info("Reindirizzamento a Stripe Connect in corso...");
    setTimeout(() => setIsStripeLoading(false), 1500);
  };

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

        {/* Stripe */}
        <IntegrationCard
          accentColor="#635BFF"
          connected={isStripeConnected}
          icon={<CreditCard className="size-7" style={{ color: "#635BFF" }} />}
          iconBg="#635BFF15"
          title="Stripe"
          description="Accetta pagamenti dai clienti e gestisci abbonamenti per i tuoi pacchetti."
        >
          {isStripeConnected ? (
            <>
              <ul className="space-y-2 text-sm text-outline">
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-[#635BFF]" /> Booster Pack attivi
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-[#635BFF]" /> Pagamenti carte e wallet
                </li>
              </ul>
              <p className="text-[11px] text-outline">
                Account collegato. I checkout Booster vengono fatturati attraverso questo account.
              </p>
            </>
          ) : (
            <>
              <ul className="space-y-2 text-sm text-outline">
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-[#635BFF]" /> Pagamenti carte e wallet
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-[#635BFF]" /> Abbonamenti ricorrenti
                </li>
              </ul>
              <Button
                onClick={handleConnectStripe}
                disabled={isStripeLoading}
                className="w-full rounded-full bg-[#635BFF] hover:bg-[#5249e0] text-white"
              >
                {isStripeLoading && <Loader2 className="size-4 animate-spin mr-2" />}
                Connetti Stripe
              </Button>
            </>
          )}
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
