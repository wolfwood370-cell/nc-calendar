import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Calendar,
  ChevronRight,
  LogOut,
  Mail,
  Link as LinkIcon,
  CheckCircle,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import {
  isPushSupported,
  isPushReady,
  subscribeToPush,
  getCurrentPushSubscription,
} from "@/lib/push";
import { toast } from "sonner";
import { SettingsRow, SettingsDivider } from "@/components/settings-row";
import { useClientBlocks, useClientBookings, useCoachEventTypes } from "@/lib/queries";
import { sessionLabel } from "@/lib/mock-data";

export const Route = createFileRoute("/client/settings")({
  component: ClientSettings,
});

interface ProfileRow {
  full_name: string | null;
  email: string | null;
  email_notifications: boolean;
  avatar_url?: string | null;
  coach_id?: string | null;
  path_type?: string;
}

function getInitials(name?: string | null, email?: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? "";
  if (a && b) return (a + b).toUpperCase();
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

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [updatingPassword, setUpdatingPassword] = useState(false);

  useEffect(() => {
    setPushSupported(isPushSupported());
    void isPushReady().then(setPushReady);
    void getCurrentPushSubscription().then((s) => setPushEnabled(!!s));
    if (!user) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("full_name, email, email_notifications, coach_id, path_type")
          .eq("id", user.id)
          .maybeSingle();
        if (data) {
          const row = data as unknown as ProfileRow;
          setProfile(row);
          setEmailEnabled(row.email_notifications ?? true);
        }
        const { data: u } = await supabase.auth.getUser();
        const providers = (u.user?.app_metadata?.providers as string[] | undefined) ?? [];
        const idents = (u.user?.identities ?? []).map((i) => i.provider);
        setGoogleLinked(providers.includes("google") || idents.includes("google"));
      } catch (e) {
        console.error("client.settings: caricamento profilo fallito", e);
      } finally {
        setLoading(false);
      }
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
            .from("push_subscriptions")
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

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("La password deve contenere almeno 8 caratteri.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Le password non coincidono.");
      return;
    }
    setUpdatingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setUpdatingPassword(false);
    if (error) {
      toast.error("Aggiornamento non riuscito", { description: error.message });
      return;
    }
    toast.success("Password aggiornata con successo.");
    setNewPassword("");
    setConfirmPassword("");
  };

  const fullName = profile?.full_name ?? user?.email ?? "Cliente";
  const email = profile?.email ?? user?.email ?? "";

  // ---- Design handoff: statistiche, badge percorso e sessioni residue ----
  const blocksQ = useClientBlocks(user?.id);
  const bookingsQ = useClientBookings(user?.id);
  const eventTypesQ = useCoachEventTypes(profile?.coach_id ?? undefined);

  const stats = useMemo(() => {
    const done = (bookingsQ.data ?? []).filter((b) => b.status === "completed").length;
    const booked = (bookingsQ.data ?? []).filter(
      (b) => b.status === "scheduled" && new Date(b.scheduled_at).getTime() > Date.now(),
    ).length;
    return { done, booked };
  }, [bookingsQ.data]);

  // Blocco che contiene "oggi" (per pool residui e scadenza percorso).
  const activeBlock = useMemo(() => {
    const now = Date.now();
    return (blocksQ.data ?? []).find((b) => {
      const start = new Date(b.start_date).getTime();
      const end = new Date(b.end_date).getTime() + 24 * 60 * 60 * 1000;
      return now >= start && now <= end;
    });
  }, [blocksQ.data]);

  const pathEndLabel = useMemo(() => {
    const ends = (blocksQ.data ?? []).map((b) => new Date(b.end_date).getTime());
    if (ends.length === 0) return null;
    const last = new Date(Math.max(...ends));
    if (last.getTime() < Date.now()) return null;
    return last.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  }, [blocksQ.data]);

  // Pool residui del blocco corrente, aggregati per tipologia.
  const pools = useMemo(() => {
    if (!activeBlock) return [];
    const ets = eventTypesQ.data ?? [];
    const map = new Map<string, { name: string; used: number; total: number }>();
    for (const a of activeBlock.allocations) {
      const key = a.event_type_id ?? a.session_type;
      const et = a.event_type_id ? ets.find((e) => e.id === a.event_type_id) : null;
      const cur = map.get(key) ?? {
        name: et?.name ?? sessionLabel(a.session_type),
        used: 0,
        total: 0,
      };
      cur.total += a.quantity_assigned;
      cur.used += a.quantity_booked;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [activeBlock, eventTypesQ.data]);

  const currentBlockSeq = activeBlock?.sequence_order ?? null;

  return (
    <div className="max-w-md mx-auto bg-surface min-h-screen">
      {/* Top App Bar */}
      <header className="bg-surface/80 backdrop-blur-xl sticky top-0 shadow-soft-card z-40">
        <div className="flex items-center w-full px-margin-mobile py-stack-md">
          <h1 className="text-2xl font-bold text-aura-primary">Profilo</h1>
        </div>
      </header>

      <main className="px-margin-mobile pt-6 pb-[120px] flex flex-col gap-6">
        {/* Hero identità: sezione trasparente centrata (avatar 88px, una iniziale) */}
        <section className="flex flex-col items-center gap-3 text-center">
          {loading ? (
            <>
              <Skeleton className="size-[88px] rounded-full" />
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-52" />
              </div>
            </>
          ) : (
            <>
              <Avatar className="size-[88px] border-[3px] border-white shadow-[0_8px_30px_rgba(0,0,0,0.1)]">
                {profile?.avatar_url ? (
                  <AvatarImage src={profile.avatar_url} alt={fullName} />
                ) : null}
                <AvatarFallback className="bg-primary-container text-on-primary-container font-display text-4xl font-bold">
                  {getInitials(profile?.full_name, email).charAt(0)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 max-w-full">
                <h2 className="font-display text-[22px] font-bold text-on-surface truncate">
                  {fullName}
                </h2>
                <p className="mt-1 text-sm text-outline truncate">{email}</p>
              </div>
              {/* Design handoff: badge stato percorso (pill navy con pallino verde) */}
              {profile?.path_type === "recurring" ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-aura-primary/8 text-aura-primary text-[13px] font-semibold">
                  <span className="size-[7px] rounded-full bg-success-strong" aria-hidden />
                  Abbonamento attivo
                </span>
              ) : pathEndLabel ? (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-aura-primary/8 text-aura-primary text-[13px] font-semibold">
                  <span className="size-[7px] rounded-full bg-success-strong" aria-hidden />
                  Percorso attivo · scade {pathEndLabel}
                </span>
              ) : null}
            </>
          )}
        </section>

        {/* Design handoff: riga statistiche — 3 card separate */}
        {!loading && (
          <section className="grid grid-cols-3 gap-3">
            <div className="bg-surface-container-lowest rounded-[20px] shadow-soft-card border border-outline-variant/30 px-2 py-4 text-center">
              <span className="block font-display text-2xl font-bold text-aura-primary tabular-nums">
                {stats.done}
              </span>
              <span className="block mt-1 text-[11px] text-outline">sessioni fatte</span>
            </div>
            <div className="bg-surface-container-lowest rounded-[20px] shadow-soft-card border border-outline-variant/30 px-2 py-4 text-center">
              <span className="block font-display text-2xl font-bold text-aura-primary tabular-nums">
                {currentBlockSeq != null ? `Blocco ${currentBlockSeq}` : "—"}
              </span>
              <span className="block mt-1 text-[11px] text-outline">in corso</span>
            </div>
            <div className="bg-surface-container-lowest rounded-[20px] shadow-soft-card border border-outline-variant/30 px-2 py-4 text-center">
              <span className="block font-display text-2xl font-bold text-aura-primary tabular-nums">
                {stats.booked}
              </span>
              <span className="block mt-1 text-[11px] text-outline">prenotate</span>
            </div>
          </section>
        )}

        {/* Design handoff: sessioni residue per pool con barre */}
        {!loading && pools.length > 0 && (
          <section className="bg-surface-container-lowest rounded-[1.5rem] shadow-soft-card border border-outline-variant/30 p-5 flex flex-col gap-3">
            <h3 className="text-base font-bold text-on-surface m-0">Le tue sessioni residue</h3>
            {pools.map((p) => {
              const left = Math.max(0, p.total - p.used);
              // Barra = quota residua: piena quando tutte disponibili, si svuota con l'uso.
              const pct = p.total > 0 ? Math.round((left / p.total) * 100) : 0;
              return (
                <div key={p.name} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-on-surface">{p.name}</span>
                    <span
                      className={`text-[13px] font-bold tabular-nums ${left > 0 ? "text-aura-primary" : "text-outline"}`}
                    >
                      {left} disponibili
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className="h-full rounded-full bg-aura-primary transition-[width] duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Design handoff: menu — Acquista Booster */}
        <section className="bg-surface-container-lowest rounded-[1.5rem] shadow-soft-card border border-outline-variant/30 overflow-hidden">
          <Link
            to="/client/store"
            className="flex items-center gap-3.5 px-5 py-4 active:bg-surface-container-low transition-colors"
          >
            <span className="size-9 rounded-[10px] bg-aura-primary/6 text-aura-primary grid place-items-center shrink-0">
              <Sparkles className="size-[18px]" aria-hidden />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-on-surface">Acquista Booster</span>
              <span className="block mt-0.5 text-xs text-outline">Sessioni e test aggiuntivi</span>
            </span>
            <ChevronRight className="size-[18px] text-outline-variant" aria-hidden />
          </Link>
        </section>

        {/* Notifiche */}
        <section>
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-stack-sm ml-2">
            Notifiche
          </h3>
          <div className="bg-surface-container-lowest rounded-[1.5rem] shadow-soft-card border border-outline-variant/30 overflow-hidden">
            <SettingsRow
              icon={<Bell className="size-[18px]" />}
              title="Notifiche Push"
              subtitle={
                !pushSupported
                  ? "Non supportate su questo dispositivo"
                  : !pushReady
                    ? "Disponibili solo sull'app installata o sul sito pubblicato"
                    : pushEnabled
                      ? "Attive — riceverai avvisi sul telefono"
                      : "Ricevi avvisi sul telefono"
              }
              control={
                pushBusy ? (
                  <Loader2 className="size-5 animate-spin text-on-surface-variant" />
                ) : (
                  <Switch
                    checked={pushEnabled}
                    disabled={!pushSupported || !pushReady || pushBusy}
                    onCheckedChange={togglePush}
                  />
                )
              }
            />
            <SettingsDivider />
            <SettingsRow
              icon={<Mail className="size-[18px]" />}
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
          <div className="bg-surface-container-lowest rounded-[1.5rem] shadow-soft-card border border-outline-variant/30 overflow-hidden">
            {googleLinked ? (
              <div className="w-full flex items-center gap-3.5 px-5 py-4">
                <span className="size-9 rounded-[10px] bg-aura-primary/6 text-aura-primary grid place-items-center shrink-0">
                  <Calendar className="size-[18px]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-on-surface">
                    Account Google collegato
                  </span>
                  <span className="block mt-0.5 text-xs text-outline">
                    Puoi accedere anche con Google
                  </span>
                </span>
                <CheckCircle className="size-5 text-emerald-600" />
              </div>
            ) : (
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center gap-3.5">
                  <span className="size-9 rounded-[10px] bg-aura-primary/6 text-aura-primary grid place-items-center shrink-0">
                    <Calendar className="size-[18px]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-on-surface">Collega Account Google</p>
                    <p className="mt-0.5 text-xs text-outline">
                      Per collegarlo, esci e accedi con Google usando la stessa email
                      {email ? ` (${email})` : ""}. Il tuo account verrà collegato automaticamente,
                      mantenendo prenotazioni e dati.
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

        {/* Sicurezza */}
        <section>
          <h3 className="text-sm font-semibold text-on-surface-variant uppercase tracking-wider mb-stack-sm ml-2">
            Sicurezza
          </h3>
          <div className="bg-surface-container-lowest rounded-[1.5rem] shadow-soft-card border border-outline-variant/30 overflow-hidden">
            <form onSubmit={handleUpdatePassword} className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-center gap-3.5">
                <span className="size-9 rounded-[10px] bg-aura-primary/6 text-aura-primary grid place-items-center shrink-0">
                  <Lock className="size-[18px]" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-on-surface">Cambia password</p>
                  <p className="mt-0.5 text-xs text-outline">
                    Aggiorna la password fornita dal coach.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-on-surface" htmlFor="new-password">
                  Nuova Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 text-base text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-on-surface" htmlFor="confirm-password">
                  Conferma Nuova Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                  autoComplete="new-password"
                  className="w-full rounded-2xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 text-base text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
                />
              </div>
              <button
                type="submit"
                disabled={updatingPassword}
                className="w-full bg-aura-primary text-white font-semibold text-sm py-3 rounded-full hover:opacity-90 transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {updatingPassword ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Lock className="size-4" />
                )}
                Aggiorna Password
              </button>
            </form>
          </div>
        </section>

        {/* Logout */}
        <section>
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
