import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, MessageCircle, CalendarRange } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer/integrations")({
  component: IntegrationsPage,
});

interface Settings {
  wa_phone_id: string;
  wa_access_token: string;
  wa_enabled: boolean;
  gcal_webhook_url: string;
  gcal_enabled: boolean;
}

const empty: Settings = {
  wa_phone_id: "",
  wa_access_token: "",
  wa_enabled: false,
  gcal_webhook_url: "",
  gcal_enabled: false,
};

const waSchema = z.object({
  wa_phone_id: z.string().trim().min(3, "ID telefono troppo corto").max(64),
  wa_access_token: z.string().trim().min(10, "Token troppo corto").max(2048),
});

const gcalSchema = z.object({
  gcal_webhook_url: z.string().trim().url("URL non valido").max(2048),
});

function IntegrationsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(empty);
  const [loading, setLoading] = useState(true);
  const [savingWa, setSavingWa] = useState(false);
  const [savingGcal, setSavingGcal] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("wa_phone_id, wa_access_token, wa_enabled, gcal_webhook_url, gcal_enabled")
        .eq("coach_id", user.id)
        .maybeSingle();
      if (error) toast.error("Errore nel caricamento delle impostazioni");
      if (data) {
        setSettings({
          wa_phone_id: data.wa_phone_id ?? "",
          wa_access_token: data.wa_access_token ?? "",
          wa_enabled: data.wa_enabled ?? false,
          gcal_webhook_url: data.gcal_webhook_url ?? "",
          gcal_enabled: data.gcal_enabled ?? false,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const upsert = async (patch: Partial<Settings>) => {
    if (!user) return;
    const next = { ...settings, ...patch };
    const { error } = await supabase
      .from("integration_settings")
      .upsert({ coach_id: user.id, ...next }, { onConflict: "coach_id" });
    if (error) {
      toast.error("Errore nel salvataggio", { description: error.message });
      return false;
    }
    setSettings(next);
    return true;
  };

  const saveWa = async () => {
    const parsed = waSchema.safeParse(settings);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dati non validi");
      return;
    }
    setSavingWa(true);
    try {
      const ok = await upsert({
        wa_phone_id: parsed.data.wa_phone_id,
        wa_access_token: parsed.data.wa_access_token,
      });
      if (ok) toast.success("Impostazioni WhatsApp salvate");
    } finally {
      setSavingWa(false);
    }
  };

  const saveGcal = async () => {
    const parsed = gcalSchema.safeParse(settings);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "URL non valido");
      return;
    }
    setSavingGcal(true);
    try {
      const ok = await upsert({ gcal_webhook_url: parsed.data.gcal_webhook_url });
      if (ok) toast.success("Impostazioni Google Calendar salvate");
    } finally {
      setSavingGcal(false);
    }
  };

  const toggleWa = async (v: boolean) => {
    if (v && (!settings.wa_phone_id || !settings.wa_access_token)) {
      toast.error("Configura prima Token e Phone Number ID");
      return;
    }
    const ok = await upsert({ wa_enabled: v });
    if (ok) toast.success(v ? "Notifiche WhatsApp abilitate" : "Notifiche WhatsApp disabilitate");
  };

  const toggleGcal = async (v: boolean) => {
    if (v && !settings.gcal_webhook_url) {
      toast.error("Configura prima il Webhook URL");
      return;
    }
    const ok = await upsert({ gcal_enabled: v });
    if (ok) toast.success(v ? "Sincronizzazione calendario abilitata" : "Sincronizzazione calendario disabilitata");
  };

  const waConfigured = !!settings.wa_phone_id && !!settings.wa_access_token;
  const gcalConfigured = !!settings.gcal_webhook_url;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Integrazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connetti WhatsApp Business e Google Calendar per automatizzare le notifiche e la sincronizzazione.
        </p>
      </div>

      {/* WhatsApp */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-md bg-success/10 text-success grid place-items-center">
                <MessageCircle className="size-5" />
              </div>
              <div>
                <CardTitle>WhatsApp Business</CardTitle>
                <CardDescription>Invia notifiche automatiche ai tuoi clienti via Meta Cloud API.</CardDescription>
              </div>
            </div>
            <StatusBadge ok={waConfigured && settings.wa_enabled} configured={waConfigured} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wa-phone">Phone Number ID</Label>
              <Input
                id="wa-phone"
                value={settings.wa_phone_id}
                onChange={(e) => setSettings((s) => ({ ...s, wa_phone_id: e.target.value }))}
                placeholder="es. 109876543210987"
                maxLength={64}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wa-token">WhatsApp API Token</Label>
              <Input
                id="wa-token"
                type="password"
                value={settings.wa_access_token}
                onChange={(e) => setSettings((s) => ({ ...s, wa_access_token: e.target.value }))}
                placeholder="EAAG..."
                maxLength={2048}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Switch id="wa-enabled" checked={settings.wa_enabled} onCheckedChange={toggleWa} />
              <Label htmlFor="wa-enabled" className="cursor-pointer">Abilita Notifiche WhatsApp</Label>
            </div>
            <Button onClick={saveWa} disabled={savingWa}>
              {savingWa && <Loader2 className="size-4 animate-spin" />} Salva
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Google Calendar */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-md bg-primary/10 text-primary grid place-items-center">
                <CalendarRange className="size-5" />
              </div>
              <div>
                <CardTitle>Google Calendar</CardTitle>
                <CardDescription>
                  Sincronizza automaticamente le sessioni nel tuo calendario tramite un webhook esterno.
                </CardDescription>
              </div>
            </div>
            <StatusBadge ok={gcalConfigured && settings.gcal_enabled} configured={gcalConfigured} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gcal-url">Webhook URL</Label>
            <Input
              id="gcal-url"
              value={settings.gcal_webhook_url}
              onChange={(e) => setSettings((s) => ({ ...s, gcal_webhook_url: e.target.value }))}
              placeholder="https://script.google.com/..."
              maxLength={2048}
            />
            <p className="text-xs text-muted-foreground">
              Inserisci l'URL di un Apps Script o Cloud Function che riceve gli eventi prenotazione.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Switch id="gcal-enabled" checked={settings.gcal_enabled} onCheckedChange={toggleGcal} />
              <Label htmlFor="gcal-enabled" className="cursor-pointer">Sincronizza Calendario</Label>
            </div>
            <Button onClick={saveGcal} disabled={savingGcal}>
              {savingGcal && <Loader2 className="size-4 animate-spin" />} Salva
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ ok, configured }: { ok: boolean; configured: boolean }) {
  if (ok) {
    return (
      <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
        Connesso
      </Badge>
    );
  }
  if (configured) return <Badge variant="outline">Configurato (disabilitato)</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Non configurato</Badge>;
}
