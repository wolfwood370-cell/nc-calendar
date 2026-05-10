import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { isPushSupported, subscribeToPush, getCurrentPushSubscription } from "@/lib/push";
import { toast } from "sonner";

export const Route = createFileRoute("/client/settings")({
  component: ClientSettings,
});

function ClientSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    setPushSupported(isPushSupported());
    void getCurrentPushSubscription().then((s) => setPushEnabled(!!s));
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email_notifications")
        .eq("id", user.id)
        .maybeSingle();
      setEmailEnabled(data?.email_notifications ?? true);
      setLoading(false);
    })();
  }, [user]);

  const toggle = async (next: boolean) => {
    if (!user) return;
    setSaving(true);
    setEmailEnabled(next);
    const { error } = await supabase
      .from("profiles")
      .update({ email_notifications: next })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      setEmailEnabled(!next);
      toast.error("Errore nel salvataggio", { description: error.message });
    } else {
      toast.success(next ? "Email di conferma attivate" : "Email di conferma disattivate");
    }
  };

  const enablePush = async () => {
    if (!user) return;
    setPushBusy(true);
    try {
      await subscribeToPush(user.id);
      setPushEnabled(true);
      toast.success("Notifiche attivate", {
        description: "Riceverai avvisi sul telefono per le tue prenotazioni.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Riprova";
      if (msg.toLowerCase().includes("permesso")) {
        toast.warning("Permesso negato", {
          description: "Abilita le notifiche dalle impostazioni del browser.",
        });
      } else {
        toast.error("Impossibile attivare le notifiche", { description: msg });
      }
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Impostazioni</h1>
        <p className="text-sm text-muted-foreground mt-1">Gestisci le tue preferenze di notifica.</p>
      </div>
      <Alert>
        <BellRing className="size-4" />
        <AlertTitle>Rimani Aggiornato</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>
            {pushEnabled
              ? "Le notifiche push sono attive su questo dispositivo."
              : "Attiva le notifiche per ricevere conferme e promemoria direttamente sul telefono."}
          </p>
          {!pushEnabled && (
            <Button size="sm" onClick={enablePush} disabled={!pushSupported || pushBusy}>
              <Bell className="size-4" />
              {pushBusy ? "Attivazione..." : "Attiva Notifiche sul Telefono"}
            </Button>
          )}
          {!pushSupported && (
            <p className="text-xs text-muted-foreground">
              Il tuo dispositivo o browser non supporta le notifiche push.
            </p>
          )}
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifiche</CardTitle>
          <CardDescription>Scegli come ricevere gli aggiornamenti sulle tue prenotazioni.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="email-notif" className="text-sm font-medium">Ricevi conferme via Email</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ti invieremo un'email ad ogni nuova prenotazione confermata.
                </p>
              </div>
              <Switch id="email-notif" checked={emailEnabled} disabled={saving} onCheckedChange={toggle} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
