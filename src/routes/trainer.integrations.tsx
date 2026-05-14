import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Calendar,
  CreditCard,
  Video,
  Loader2,
  Check,
  RefreshCw,
  ShieldCheck,
  Mail,
  Clock,
  LogOut,
} from "lucide-react";

export const Route = createFileRoute("/trainer/integrations")({
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { user } = useAuth();
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [isCalendarSyncEnabled, setIsCalendarSyncEnabled] = useState(true);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [calendarSheetOpen, setCalendarSheetOpen] = useState(false);

  // Check connection state from Supabase session + integration_settings
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!user) return;
      // 1) Check Google identity on the current user
      const googleIdentity = user.identities?.find((i) => i.provider === "google");
      const emailFromIdentity =
        (googleIdentity?.identity_data as { email?: string } | undefined)?.email ?? null;

      // 2) Check integration_settings.gcal_enabled
      const { data: settings } = await supabase
        .from("integration_settings")
        .select("gcal_enabled, gcal_calendar_id")
        .eq("coach_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      const connected = !!googleIdentity || !!settings?.gcal_enabled;
      setIsCalendarConnected(connected);
      setConnectedEmail(emailFromIdentity ?? settings?.gcal_calendar_id ?? user.email ?? null);
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleToggleCalendarSync = (v: boolean) => {
    setIsCalendarSyncEnabled(v);
    toast.success("Sincronizzazione automatica aggiornata.");
  };

  const handleConnectCalendar = async () => {
    setIsCalendarLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/trainer/integrations`,
          scopes: "https://www.googleapis.com/auth/calendar",
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
      toast.info("Reindirizzamento a Google in corso...");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore di connessione";
      toast.error(msg);
      setIsCalendarLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    setIsStripeLoading(true);
    toast.info("Reindirizzamento a Stripe Connect in corso...");
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
          connected={isCalendarConnected}
          icon={<Calendar className="size-7" style={{ color: "#4285F4" }} />}
          iconBg="#4285F415"
          title="Google Calendar"
          description="Sincronizza automaticamente le sessioni con il tuo calendario Google."
        >
          {isCalendarConnected ? (
            <>
              {connectedEmail && (
                <p className="text-xs text-[#647d8e] flex items-center gap-1.5">
                  <Mail className="size-3" /> {connectedEmail}
                </p>
              )}
              <div className="flex items-center justify-between rounded-2xl bg-[#f8f9fe] px-4 py-3">
                <Label
                  htmlFor="cal-sync"
                  className="text-sm font-medium text-[#003a5c] cursor-pointer"
                >
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
                onClick={() => setCalendarSheetOpen(true)}
                className="w-full rounded-full border-[#e5edf3] text-[#003a5c] hover:bg-[#f8f9fe]"
              >
                Gestisci connessione
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={handleConnectCalendar}
                disabled={isCalendarLoading}
                className="w-full rounded-full bg-[#4285F4] hover:bg-[#3a76db] text-white"
              >
                {isCalendarLoading && <Loader2 className="size-4 animate-spin mr-2" />}
                Connetti Google Calendar
              </Button>
              <p className="text-[11px] leading-relaxed text-[#647d8e] px-1">
                Nota: Per la sincronizzazione corretta, utilizza esclusivamente l'account{" "}
                <span className="font-medium text-[#003a5c]">nctrainingsystems@gmail.com</span>.
              </p>
            </>
          )}
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

      <CalendarManageSheet
        open={calendarSheetOpen}
        onOpenChange={setCalendarSheetOpen}
        onDisconnect={() => {
          setIsCalendarConnected(false);
          setCalendarSheetOpen(false);
          toast.success("Account Google Calendar disconnesso.");
        }}
      />
    </div>
  );
}

interface CalendarManageSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDisconnect: () => void;
}

function CalendarManageSheet({ open, onOpenChange, onDisconnect }: CalendarManageSheetProps) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncNow = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      toast.success("Sincronizzazione completata. 2 nuovi eventi importati.");
    }, 2000);
  };

  const logs = [
    { when: "Oggi, 09:15", text: "Nessun nuovo evento" },
    { when: "Ieri, 18:30", text: "Importati 3 eventi PT" },
    { when: "Ieri, 08:00", text: "Sincronizzazione automatica completata" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-[#f8f9fe] border-l border-[#e5edf3] p-0 overflow-y-auto"
      >
        <div className="p-6 space-y-6">
          <SheetHeader className="space-y-1">
            <SheetTitle className="font-display text-2xl text-[#003a5c]">
              Gestisci Google Calendar
            </SheetTitle>
            <SheetDescription className="text-[#647d8e]">
              Controlla la connessione e la sincronizzazione del tuo calendario.
            </SheetDescription>
          </SheetHeader>

          {/* Status & Account */}
          <div className="rounded-[24px] bg-white p-5 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-[#4285F415] grid place-items-center">
                <Calendar className="size-5" style={{ color: "#4285F4" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Mail className="size-3.5 text-[#647d8e]" />
                  <p className="text-sm font-medium text-[#003a5c] truncate">
                    coach@nccalendar.it
                  </p>
                </div>
                <p className="text-xs text-[#647d8e] mt-0.5 flex items-center gap-1">
                  <Clock className="size-3" /> Ultima sincronizzazione automatica: 5 min fa
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-medium">
                <ShieldCheck className="size-3" /> Verificato
              </span>
            </div>
          </div>

          {/* Manual Sync */}
          <div className="rounded-[24px] bg-white p-5 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-[#003a5c]">
                Sincronizzazione manuale
              </h3>
              <p className="text-xs text-[#647d8e] mt-1">
                Avvia subito un controllo per importare nuovi eventi.
              </p>
            </div>
            <Button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="w-full rounded-full bg-[#003a5c] hover:bg-[#002a44] text-white h-11"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" /> Sincronizzazione in corso...
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-2" /> Sincronizza ora
                </>
              )}
            </Button>
          </div>

          {/* Sync Logs */}
          <div className="rounded-[24px] bg-white p-5 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] space-y-3">
            <h3 className="font-display text-base font-semibold text-[#003a5c]">
              Attività recente
            </h3>
            <ul className="space-y-2">
              {logs.map((l, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-2xl bg-[#f8f9fe] px-4 py-3"
                >
                  <div className="size-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#003a5c]">{l.text}</p>
                    <p className="text-xs text-[#647d8e] mt-0.5">{l.when}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Danger Zone */}
          <div className="rounded-[24px] border border-red-200 bg-red-50/40 p-5 space-y-3">
            <div>
              <h3 className="font-display text-base font-semibold text-red-700">Zona pericolosa</h3>
              <p className="text-xs text-red-600/80 mt-1">
                La disconnessione interromperà tutte le sincronizzazioni automatiche.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full rounded-full border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                >
                  <LogOut className="size-4 mr-2" /> Disconnetti account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-[24px]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnettere Google Calendar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sei sicuro di voler disconnettere Google Calendar? La sincronizzazione degli
                    appuntamenti verrà interrotta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDisconnect}
                    className="rounded-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    Disconnetti
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface IntegrationCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  accentColor: string;
  connected: boolean;
  status?: "connected" | "disconnected" | "error";
  children: React.ReactNode;
}

function IntegrationCard({
  title,
  description,
  icon,
  iconBg,
  accentColor,
  connected,
  status,
  children,
}: IntegrationCardProps) {
  const resolvedStatus: "connected" | "disconnected" | "error" =
    status ?? (connected ? "connected" : "disconnected");
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
        <StatusPill status={resolvedStatus} />
      </div>
      <h3 className="font-display text-lg font-semibold text-[#003a5c] mb-1">{title}</h3>
      <p className="text-sm text-[#647d8e] mb-5 min-h-[40px]">{description}</p>
      {resolvedStatus === "error" ? (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          Errore di connessione. Riprova a collegare l'account.
        </div>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "connected" | "disconnected" | "error" }) {
  if (status === "connected") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-medium">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Connesso
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-3 py-1 text-xs font-medium">
        <span className="size-1.5 rounded-full bg-red-500" />
        Errore di connessione
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
