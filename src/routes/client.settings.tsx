import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Calendar, LogOut, Mail, Link as LinkIcon, CheckCircle, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { isPushSupported, isPushReady, subscribeToPush, getCurrentPushSubscription } from "@/lib/push";
import { toast } from "sonner";

export const Route = createFileRoute("/client/settings")({
  component: ClientSettings,
});

interface ProfileRow {
  full_name: string | null;
  email: string | null;
  email_notifications: boolean;
  avatar_url?: string | null;
}

function getInitials(name?: string | null, email?: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function ClientSettings() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushReady, setPushReady] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  const [googleLinked, setGoogleLinked] = useState(false);
  const [googleLinking, setGoogleLinking] = useState(false);

  useEffect(() => {
    setPushSupported(isPushSupported());
    void isPushReady().then(setPushReady);
    void getCurrentPushSubscription().then((s) => setPushEnabled(!!s));
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, email_notifications")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setProfile(data as ProfileRow);
        setEmailEnabled(data.email_notifications ?? true);
      }
      const { data: u } = await supabase.auth.getUser();
      const providers = (u.user?.app_metadata?.providers as string[] | undefined) ?? [];
      const idents = (u.user?.identities ?? []).map((i) => i.provider);
      setGoogleLinked(providers.includes("google") || idents.includes("google"));
      setLoading(false);
    })();
  }, [user]);

  const toggleEmail = async (next: boolean) => {
    if (!user) return;
    setSavingEmail(true);
    setEmailEnabled(next);
    const { error } = await supabase
      .from("profiles")
      .update({ email_notifications: next })
      .eq("id", user.id);
    setSavingEmail(false);
    if (error) {
      setEmailEnabled(!next);
      toast.error("Errore nel salvataggio", { description: error.message });
    } else {
      toast.success(next ? "Email di conferma attivate" : "Email di conferma disattivate");
    }
  };

  const togglePush = async (next: boolean) => {
    if (!user) return;
    if (!pushSupported) {
      toast.error("Notifiche non supportate", {
        description: "Il tuo dispositivo o browser non supporta le notifiche push.",
      });
      return;
    }
    if (!pushReady) {
      toast.warning("Non disponibili in anteprima", {
        description: "Le notifiche push funzionano solo sull'app installata o sul sito pubblicato.",
      });
      return;
    }
    setPushBusy(true);
    try {
      if (next) {
        await subscribeToPush(user.id);
        setPushEnabled(true);
        toast.success("Notifiche attivate", {
          description: "Riceverai avvisi sul telefono per le tue prenotazioni.",
        });
      } else {
        const sub = await getCurrentPushSubscription();
        if (sub) {
          await sub.unsubscribe();
          await supabase
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .from("push_subscriptions" as any)
            .delete()
            .eq("profile_id", user.id)
            .eq("endpoint", sub.endpoint);
        }
        setPushEnabled(false);
        toast.success("Notifiche disattivate");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Riprova";
      if (msg.toLowerCase().includes("permesso")) {
        toast.warning("Permesso negato", {
          description: "Abilita le notifiche dalle impostazioni del browser.",
        });
      } else {
        toast.error("Operazione fallita", { description: msg });
      }
    } finally {
      setPushBusy(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  const handleSignOutToLinkGoogle = async () => {
    if (googleLinked || googleLinking) return;
    setGoogleLinking(true);
    toast.info("Accedi con Google usando la stessa email", {
      description: email || "Il tuo account verrà collegato automaticamente.",
    });
    await signOut();
    navigate({ to: "/auth" });
  };

  const fullName = profile?.full_name ?? user?.email ?? "Cliente";
  const email = profile?.email ?? user?.email ?? "";

  return (
    <div className="max-w-md mx-auto bg-surface min-h-screen">
      {/* Top App Bar */}
      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 shadow-[0_8px_30px_rgba(0,0,0,0.04)] z-40">
        <div className="flex items-center w-full px-margin-mobile py-stack-md">
          <h1 className="text-2xl font-bold text-[#003e62]">Profilo</h1>
        </div>
      </header>

      <main className="px-margin-mobile pt-stack-md flex flex-col gap-stack-lg">
        {/* Profile Card */}
        <section className="bg-surface-container-lowest rounded-[1.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-stack-lg border border-outline-variant/30 flex items-center gap-4">
          {loading ? (
            <>
              <Skeleton className="size-16 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </>
          ) : (
            <>
              <Avatar className="size-16 border-2 border-surface-container-lowest shadow-sm">
                {profile?.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={fullName} />
                ) : null}
                <AvatarFallback className="bg-primary-container text-on-primary-container font-semibold text-lg">
                  {getInitials(profile?.full_name, email)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-lg font-semibold text-on-surface truncate">{fullName}</p>
                <p className="text-sm text-on-surface-variant truncate">{email}</p>
              </div>
            </>
          )}
        </section>

        {/* Notifiche */}
        <section>
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-stack-sm ml-2">
            Notifiche
          </h3>
          <div className="bg-surface-container-lowest rounded-[1.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-outline-variant/30 overflow-hidden">
            <Row
              icon={<Bell className="size-5" />}
              title="Notifiche Push"
              subtitle={
                pushSupported
                  ? "Ricevi avvisi sul telefono"
                  : "Non supportate su questo dispositivo"
              }
              control={
                <Switch
                  checked={pushEnabled}
                  disabled={!pushSupported || pushBusy}
                  onCheckedChange={togglePush}
                />
              }
            />
            <Divider />
            <Row
              icon={<Mail className="size-5" />}
              title="Email di conferma"
              subtitle="Ricevi email per ogni prenotazione"
              control={
                <Switch
                  checked={emailEnabled}
                  disabled={savingEmail || loading}
                  onCheckedChange={toggleEmail}
                />
              }
            />
          </div>
        </section>

        {/* Integrazioni */}
        <section>
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-stack-sm ml-2">
            Integrazioni
          </h3>
          <div className="bg-surface-container-lowest rounded-[1.5rem] shadow-[0_8px_30px_rgba(0,0,0,0.04)] border border-outline-variant/30 overflow-hidden">
            {googleLinked ? (
              <div className="w-full flex items-center gap-4 px-5 py-4">
                <span className="size-10 rounded-full bg-primary-container/10 text-primary-container grid place-items-center">
                  <Calendar className="size-5" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-base font-medium text-on-surface">
                    Account Google collegato
                  </span>
                  <span className="block text-sm text-on-surface-variant">
                    Puoi accedere anche con Google
                  </span>
                </span>
                <CheckCircle className="size-5 text-emerald-600" />
              </div>
            ) : (
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <span className="size-10 rounded-full bg-primary-container/10 text-primary-container grid place-items-center">
                    <Calendar className="size-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-on-surface">
                      Collega Account Google
                    </p>
                    <p className="text-sm text-on-surface-variant">
                      Per collegarlo, esci e accedi con Google usando la stessa email{email ? ` (${email})` : ""}. Il tuo account verrà collegato automaticamente, mantenendo prenotazioni e dati.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSignOutToLinkGoogle}
                  disabled={googleLinking || loading}
                  className="w-full bg-primary-container/10 text-on-surface font-medium text-sm py-3 rounded-full hover:bg-primary-container/20 transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {googleLinking ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <LinkIcon className="size-4" />
                  )}
                  Esci e collega Google
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Logout */}
        <section className="pb-8">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full bg-transparent border border-outline-variant text-on-error-container font-semibold text-base py-4 rounded-full hover:bg-error-container/30 transition active:scale-95 flex items-center justify-center gap-2"
          >
            <LogOut className="size-5" />
            Esci dall'account
          </button>
        </section>
      </main>
    </div>
  );
}

function Row({
  icon,
  title,
  subtitle,
  control,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <span className="size-10 rounded-full bg-primary-container/10 text-primary-container grid place-items-center">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-on-surface">{title}</p>
        {subtitle && <p className="text-sm text-on-surface-variant">{subtitle}</p>}
      </div>
      {control}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-outline-variant/40 mx-5" />;
}
