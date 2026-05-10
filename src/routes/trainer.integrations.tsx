import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  gcal_service_account_json: string;
  gcal_calendar_id: string;
  gcal_enabled: boolean;
  calendar_optimization_enabled: boolean;
}

const empty: Settings = {
  wa_phone_id: "",
  wa_access_token: "",
  wa_enabled: false,
  gcal_service_account_json: "",
  gcal_calendar_id: "",
  gcal_enabled: false,
  calendar_optimization_enabled: true,
};

const waSchema = z.object({
  wa_phone_id: z.string().trim().min(3, "ID telefono troppo corto").max(64),
  wa_access_token: z.string().trim().min(10, "Token troppo corto").max(2048),
});

const gcalSchema = z.object({
  gcal_calendar_id: z.string().trim().email("ID calendario non valido (deve essere un'email)").max(255),
  gcal_service_account_json: z
    .string()
    .trim()
    .min(20, "Service Account JSON troppo corto")
    .max(8192)
    .refine((v) => {
      try {
        const parsed = JSON.parse(v);
        return parsed && typeof parsed.client_email === "string" && typeof parsed.private_key === "string";
      } catch {
        return false;
      }
    }, "JSON non valido o mancano i campi client_email / private_key"),
});

function IntegrationsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(empty);
  const [loading, setLoading] = useState(true);
  const [savingWa, setSavingWa] = useState(false);
  const [savingGcal, setSavingGcal] = useState(false);
  const [importingHistory, setImportingHistory] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("integration_settings")
        .select("*")
        .eq("coach_id", user.id)
        .maybeSingle();
      if (error) toast.error("Errore nel caricamento delle impostazioni");
      if (data) {
        const d = data as Record<string, unknown>;
        setSettings({
          wa_phone_id: (d.wa_phone_id as string) ?? "",
          wa_access_token: (d.wa_access_token as string) ?? "",
          wa_enabled: (d.wa_enabled as boolean) ?? false,
          gcal_service_account_json: (d.gcal_service_account_json as string) ?? "",
          gcal_calendar_id: (d.gcal_calendar_id as string) ?? "",
          gcal_enabled: (d.gcal_enabled as boolean) ?? false,
          calendar_optimization_enabled: (d.calendar_optimization_enabled as boolean) ?? true,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const upsert = async (patch: Partial<Settings>) => {
    if (!user) return false;
    const next = { ...settings, ...patch };
    const { error } = await supabase
      .from("integration_settings")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({ coach_id: user.id, ...next } as any, { onConflict: "coach_id" });
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
      toast.error(parsed.error.issues[0]?.message ?? "Dati non validi");
      return;
    }
    setSavingGcal(true);
    try {
      const ok = await upsert({
        gcal_calendar_id: parsed.data.gcal_calendar_id,
        gcal_service_account_json: parsed.data.gcal_service_account_json,
      });
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
    if (v && (!settings.gcal_calendar_id || !settings.gcal_service_account_json)) {
      toast.error("Configura prima Service Account JSON e ID Calendario");
      return;
    }
    const ok = await upsert({ gcal_enabled: v });
    if (ok) toast.success(v ? "Sincronizzazione calendario abilitata" : "Sincronizzazione calendario disabilitata");
  };

  const toggleOptimization = async (v: boolean) => {
    const ok = await upsert({ calendar_optimization_enabled: v });
    if (ok) toast.success(v ? "Ottimizzazione calendario attivata" : "Ottimizzazione calendario disattivata");
  };

  const waConfigured = !!settings.wa_phone_id && !!settings.wa_access_token;
  const gcalConfigured = !!settings.gcal_calendar_id && !!settings.gcal_service_account_json;

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
              {savingWa && <Loader2 className="size-4 animate-spin" />} Salva Impostazioni
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
                  Sincronizza automaticamente le sessioni nel tuo calendario tramite un Service Account Google.
                </CardDescription>
              </div>
            </div>
            <GcalStatusBadge ok={gcalConfigured && settings.gcal_enabled} configured={gcalConfigured} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gcal-id">ID Calendario</Label>
            <Input
              id="gcal-id"
              value={settings.gcal_calendar_id}
              onChange={(e) => setSettings((s) => ({ ...s, gcal_calendar_id: e.target.value }))}
              placeholder="es. coach@example.com"
              maxLength={255}
            />
            <p className="text-xs text-muted-foreground">
              Solitamente l'email del calendario Google. Ricorda di condividerlo con il Service Account.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gcal-sa">Service Account JSON</Label>
            <Textarea
              id="gcal-sa"
              value={settings.gcal_service_account_json}
              onChange={(e) => setSettings((s) => ({ ...s, gcal_service_account_json: e.target.value }))}
              placeholder='{"type":"service_account","client_email":"...","private_key":"..."}'
              rows={8}
              className="font-mono text-xs"
              maxLength={8192}
            />
            <p className="text-xs text-muted-foreground">
              Incolla l'intero contenuto del file JSON. La chiave è memorizzata in modo sicuro lato server.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <Switch id="gcal-enabled" checked={settings.gcal_enabled} onCheckedChange={toggleGcal} />
              <Label htmlFor="gcal-enabled" className="cursor-pointer">Sincronizza Calendario</Label>
            </div>
            <Button onClick={saveGcal} disabled={savingGcal}>
              {savingGcal && <Loader2 className="size-4 animate-spin" />} Salva Impostazioni
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3">
            <div>
              <p className="text-sm font-medium">Importa eventi storici</p>
              <p className="text-xs text-muted-foreground">
                Recupera tutti gli eventi dal 1° gennaio 2026 a oggi e li importa come prenotazioni.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!gcalConfigured || importingHistory}
              onClick={async () => {
                if (!user) return;
                setImportingHistory(true);
                try {
                  const { data, error } = await supabase.functions.invoke("sync-calendar", {
                    body: {
                      action: "import_history",
                      coach_id: user.id,
                      range_start_iso: "2026-01-01T00:00:00Z",
                      range_end_iso: new Date().toISOString(),
                    },
                  });
                  if (error) throw error;
                  const r = data as { imported?: number; updated?: number; total?: number; skipped?: boolean; reason?: string };
                  if (r?.skipped) {
                    toast.error("Sincronizzazione non eseguita", { description: `Motivo: ${r.reason ?? "configurazione mancante"}` });
                  } else {
                    toast.success("Storico sincronizzato", {
                      description: `${r?.imported ?? 0} importati · ${r?.updated ?? 0} aggiornati · ${r?.total ?? 0} eventi totali`,
                    });
                  }
                } catch (e) {
                  toast.error("Errore sincronizzazione", { description: (e as Error).message });
                } finally {
                  setImportingHistory(false);
                }
              }}
            >
              {importingHistory && <Loader2 className="size-4 animate-spin" />} Sincronizza Storico 2026
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

function GcalStatusBadge({ ok, configured }: { ok: boolean; configured: boolean }) {
  if (ok) {
    return (
      <Badge variant="secondary" className="bg-success/10 text-success border-success/20">
        Attivo
      </Badge>
    );
  }
  if (configured) return <Badge variant="outline">Configurato (disabilitato)</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Non configurato</Badge>;
}
