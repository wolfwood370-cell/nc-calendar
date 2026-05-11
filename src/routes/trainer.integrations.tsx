import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Calendar, CreditCard, Video, Loader2, Check } from "lucide-react";

export const Route = createFileRoute("/trainer/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const [isCalendarSyncEnabled, setIsCalendarSyncEnabled] = useState(true);
  const [isStripeLoading, setIsStripeLoading] = useState(false);

  const handleToggleCalendarSync = (v: boolean) => {
    setIsCalendarSyncEnabled(v);
    toast.success("Sincronizzazione automatica aggiornata.");
  };

  const handleConnectStripe = async () => {
    setIsStripeLoading(true);
    toast.info("Reindirizzamento a Stripe Connect in corso...");
    // TODO: invoke edge function
    setTimeout(() => setIsStripeLoading(false), 1500);
  };

  const handleConnectMeet = () => {
    toast("Integrazione Google Meet in arrivo.");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[#003a5c]">
          Integrazioni
        </h1>
        <p className="text-sm text-[#647d8e] mt-1">
          Collega i tuoi strumenti preferiti per automatizzare il flusso di lavoro.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Google Calendar */}
        <IntegrationCard
          accentColor="#4285F4"
          connected
          icon={<Calendar className="size-7" style={{ color: "#4285F4" }} />}
          iconBg="#4285F415"
          title="Google Calendar"
          description="Sincronizza automaticamente le sessioni con il tuo calendario Google."
        >
          <div className="flex items-center justify-between rounded-2xl bg-[#f8f9fe] px-4 py-3">
            <Label htmlFor="cal-sync" className="text-sm font-medium text-[#003a5c] cursor-pointer">
              Sincronizzazione automatica
            </Label>
            <Switch
              id="cal-sync"
              checked={isCalendarSyncEnabled}
              onCheckedChange={handleToggleCalendarSync}
            />
          </div>
          <Button
            variant="outline"
            className="w-full rounded-full border-[#e5edf3] text-[#003a5c] hover:bg-[#f8f9fe]"
          >
            Gestisci connessione
          </Button>
        </IntegrationCard>

        {/* Stripe */}
        <IntegrationCard
          accentColor="#635BFF"
          connected={false}
          icon={<CreditCard className="size-7" style={{ color: "#635BFF" }} />}
          iconBg="#635BFF15"
          title="Stripe"
          description="Accetta pagamenti dai clienti e gestisci abbonamenti per i tuoi pacchetti."
        >
          <ul className="space-y-2 text-sm text-[#647d8e]">
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
        </IntegrationCard>

        {/* Google Meet */}
        <IntegrationCard
          accentColor="#00897B"
          connected={false}
          icon={<Video className="size-7" style={{ color: "#00897B" }} />}
          iconBg="#00897B15"
          title="Google Meet"
          description="Genera automaticamente link Google Meet per le tue sessioni online."
        >
          <ul className="space-y-2 text-sm text-[#647d8e]">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#00897B]" /> Link generati in automatico
            </li>
            <li className="flex items-center gap-2">
              <Check className="size-4 text-[#00897B]" /> Inviti integrati al cliente
            </li>
          </ul>
          <Button
            onClick={handleConnectMeet}
            variant="outline"
            className="w-full rounded-full border-[#e5edf3] text-[#003a5c] hover:bg-[#f8f9fe]"
          >
            Connetti Google Meet
          </Button>
        </IntegrationCard>
      </div>
    </div>
  );
}

interface IntegrationCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  accentColor: string;
  connected: boolean;
  children: React.ReactNode;
}

function IntegrationCard({
  title,
  description,
  icon,
  iconBg,
  accentColor,
  connected,
  children,
}: IntegrationCardProps) {
  return (
    <div className="group relative overflow-hidden bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0px_10px_30px_rgba(0,86,133,0.1)]">
      <div
        className="absolute left-0 top-0 bottom-0 w-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ backgroundColor: accentColor }}
      />
      <div className="flex items-start justify-between gap-3 mb-4">
        <div
          className="size-14 rounded-2xl grid place-items-center"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
        <StatusPill connected={connected} />
      </div>
      <h3 className="font-display text-lg font-semibold text-[#003a5c] mb-1">{title}</h3>
      <p className="text-sm text-[#647d8e] mb-5 min-h-[40px]">{description}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function StatusPill({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-medium">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Connesso
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1f4f7] text-[#647d8e] px-3 py-1 text-xs font-medium">
      <span className="size-1.5 rounded-full bg-[#9aabb8]" />
      Non connesso
    </span>
  );
}
