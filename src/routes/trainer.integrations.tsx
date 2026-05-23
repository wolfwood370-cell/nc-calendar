import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { syncCalendarAwait, clearAutoSyncThrottle, markAutoSyncDone } from "@/lib/sync-calendar";
import { useGcalWatchRenewal } from "@/hooks/use-gcal-watch-renewal";
import { queryKeys } from "@/lib/query-keys";
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
  // BUG-7 fix: keep the Google push notification channel alive. The
  // hook checks gcal_channel_expires_at and renews if < 48h to expiry.
  useGcalWatchRenewal(user?.id ?? null);
  const [isCalendarConnected, setIsCalendarConnected] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [isCalendarSyncEnabled, setIsCalendarSyncEnabled] = useState(true);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null);
  // L5 (FULL_APP_AUDIT.md): expose Google Calendar token expiry so coaches
  // can spot tokens that need re-consent before the next sync silently
  // fails. The column is populated by persistProviderTokens below and
  // refreshed server-side by sync-calendar on each successful refresh.
  const [tokenExpiresAt, setTokenExpiresAt] = useState<Date | null>(null);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  // Stripe connection state driven by integration_settings.stripe_account_id
  // (migration 20260520140000). The column is nullable; non-null = connected.
  // Until per-coach Stripe Connect onboarding ships, ops can flip this with
  // a single SQL update — see the migration file for the documented snippet.
  const [isStripeConnected, setIsStripeConnected] = useState(false);
  const [calendarSheetOpen, setCalendarSheetOpen] = useState(false);

  // Check connection + capture provider tokens after OAuth redirect
  useEffect(() => {
    let cancelled = false;

    async function persistProviderTokens(
      providerToken: string,
      providerRefreshToken: string | null,
      email: string | null,
    ) {
      if (!user) return;
      // Access tokens Google scadono in ~3600s
      const expiresAt = new Date(Date.now() + 55 * 60 * 1000).toISOString();
      const payload: {
        coach_id: string;
        gcal_enabled: boolean;
        gcal_access_token: string;
        gcal_token_expires_at: string;
        gcal_account_email: string | null;
        gcal_calendar_id: string;
        gcal_refresh_token?: string;
      } = {
        coach_id: user.id,
        gcal_enabled: true,
        gcal_access_token: providerToken,
        gcal_token_expires_at: expiresAt,
        gcal_account_email: email,
        gcal_calendar_id: email ?? "primary",
      };
      // Salva il refresh token solo se presente (Google lo rilascia solo
      // al primo consent o con prompt=consent)
      if (providerRefreshToken) payload.gcal_refresh_token = providerRefreshToken;

      const { error } = await supabase
        .from("integration_settings")
        .upsert(payload, { onConflict: "coach_id" });
      if (error) {
        console.error("integration_settings upsert failed", error);
        toast.error("Connessione riuscita ma salvataggio token fallito.");
        return;
      }
      toast.success("Google Calendar collegato con successo.");

      // Register the Google Calendar push-notification channel so the
      // backend webhook (/api/public/webhooks/gcal-watch) receives live
      // updates from day one. Fire-and-forget: a failure here doesn't
      // block the connection — auto-sync still works as fallback.
      try {
        const { data: watchData, error: watchErr } = await syncCalendarAwait({
          action: "register_watch",
          coachId: user.id,
        });
        if (watchErr) {
          console.error("register_watch invoke failed", watchErr);
        } else {
          const result = watchData as { ok?: boolean; error?: string } | null;
          if (result?.error) {
            console.error("register_watch returned error", result.error);
          }
        }
      } catch (e) {
        console.error("register_watch threw", e);
      }
    }

    async function check() {
      if (!user) return;
      // 1) Estrai eventuale provider_token dalla sessione corrente
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      const providerToken = session?.provider_token ?? null;
      const providerRefreshToken = session?.provider_refresh_token ?? null;

      const googleIdentity = user.identities?.find((i) => i.provider === "google");
      const emailFromIdentity =
        (googleIdentity?.identity_data as { email?: string } | undefined)?.email ?? null;

      // 2) Stato corrente in DB. We try-with-stripe_account_id first, then
      // fall back to the narrower SELECT if the migration hasn't shipped
      // (Postgres 42703). Same pattern queries.ts uses for is_personal /
      // category — keeps the page alive across migration races.
      type IntegrationSettingsRow = {
        gcal_enabled: boolean | null;
        gcal_account_email: string | null;
        gcal_refresh_token: string | null;
        gcal_token_expires_at: string | null;
        gcal_last_notification_at: string | null;
        stripe_account_id?: string | null;
      };
      const baseCols =
        "gcal_enabled, gcal_account_email, gcal_refresh_token, gcal_token_expires_at, gcal_last_notification_at";
      let settingsRow: IntegrationSettingsRow | null = null;
      const primaryResp = await supabase
        .from("integration_settings")
        .select(`${baseCols}, stripe_account_id`)
        .eq("coach_id", user.id)
        .maybeSingle();
      if (
        primaryResp.error &&
        ((primaryResp.error as { code?: string }).code === "42703" ||
          (primaryResp.error.message ?? "").includes("stripe_account_id"))
      ) {
        const fallback = await supabase
          .from("integration_settings")
          .select(baseCols)
          .eq("coach_id", user.id)
          .maybeSingle();
        settingsRow = (fallback.data as IntegrationSettingsRow | null) ?? null;
      } else if (!primaryResp.error) {
        settingsRow = (primaryResp.data as IntegrationSettingsRow | null) ?? null;
      }
      const settings = settingsRow;

      // 3) Se abbiamo un provider_token fresco dall'OAuth flow, persistilo
      if (providerToken && googleIdentity) {
        await persistProviderTokens(providerToken, providerRefreshToken, emailFromIdentity);
        if (cancelled) return;
        setIsCalendarConnected(true);
        setConnectedEmail(emailFromIdentity);
        // persistProviderTokens just wrote `now() + 55min`; mirror it
        // in state so the UI shows the fresh expiry immediately.
        setTokenExpiresAt(new Date(Date.now() + 55 * 60 * 1000));
        return;
      }

      if (cancelled) return;
      const connected = !!settings?.gcal_enabled;
      setIsCalendarConnected(connected);
      setConnectedEmail(settings?.gcal_account_email ?? emailFromIdentity ?? user.email ?? null);
      setTokenExpiresAt(
        settings?.gcal_token_expires_at ? new Date(settings.gcal_token_expires_at) : null,
      );
      setLastSyncAt(
        settings?.gcal_last_notification_at ? new Date(settings.gcal_last_notification_at) : null,
      );
      // Stripe: any non-null stripe_account_id flips the badge to
      // "Connesso". When the migration hasn't shipped settings.stripe_
      // account_id will be undefined and the badge stays "disconnected"
      // — matching the platform-level no-onboarding default.
      setIsStripeConnected(!!settings?.stripe_account_id);
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
        <h1 className="font-display text-3xl font-semibold tracking-tight text-aura-primary">
          Integrazioni
        </h1>
        <p className="text-sm text-outline mt-1">
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
                <p className="text-xs text-outline flex items-center gap-1.5">
                  <Mail className="size-3" /> {connectedEmail}
                </p>
              )}
              <TokenExpiryBadge expiresAt={tokenExpiresAt} />
              <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3">
                <Label
                  htmlFor="cal-sync"
                  className="text-sm font-medium text-aura-primary cursor-pointer"
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
                className="w-full rounded-full border-surface-variant text-aura-primary hover:bg-surface"
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
              <p className="text-[11px] leading-relaxed tracking-wide text-outline px-1 font-medium">
                Nota: per la sincronizzazione corretta, utilizza esclusivamente l'account{" "}
                <span className="font-semibold text-aura-primary">nctrainingsystems@gmail.com</span>
                .
              </p>
            </>
          )}
        </IntegrationCard>

        {/* Stripe — connected state driven by
            integration_settings.stripe_account_id (see migration
            20260520140000). Until per-coach Stripe Connect onboarding
            ships, ops flip this with a SQL update documented in the
            migration file. */}
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

        {/* Google Meet */}
        <IntegrationCard
          accentColor="#00897B"
          connected={false}
          icon={<Video className="size-7" style={{ color: "#00897B" }} />}
          iconBg="#00897B15"
          title="Google Meet"
          description="Genera automaticamente link Google Meet per le tue sessioni online."
        >
          <ul className="space-y-2 text-sm text-outline">
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
            className="w-full rounded-full border-surface-variant text-aura-primary hover:bg-surface"
          >
            Connetti Google Meet
          </Button>
        </IntegrationCard>
      </div>

      <CalendarManageSheet
        open={calendarSheetOpen}
        onOpenChange={setCalendarSheetOpen}
        coachId={user?.id ?? null}
        connectedEmail={connectedEmail}
        lastSyncAt={lastSyncAt}
        onDisconnect={async () => {
          if (user) {
            const { error } = await supabase
              .from("integration_settings")
              .update({
                gcal_enabled: false,
                gcal_access_token: null,
                gcal_refresh_token: null,
                gcal_token_expires_at: null,
              })
              .eq("coach_id", user.id);
            if (error) {
              console.error("Failed to clear integration tokens", error);
              toast.error("Disconnessione non riuscita. Riprova.");
              return;
            }
          }
          setIsCalendarConnected(false);
          setConnectedEmail(null);
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
  coachId: string | null;
  connectedEmail: string | null;
  lastSyncAt: Date | null;
  onDisconnect: () => void;
}

function formatRelativeIt(d: Date | null): string {
  if (!d) return "mai";
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "ora";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h fa`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} g fa`;
}

// Match logic mirroring the edge function's matchEvent (priority 1: email
// attendee == client email; priority 2: "nome cognome" substring in
// summary/description). Used by handleImportOrphans below for client-side
// import that bypasses the broken server flow.
function matchClientFromEvent(
  summary: string,
  description: string,
  attendees: Array<{ email?: string }>,
  clients: Array<{ id: string; full_name: string | null; email: string | null }>,
  coachEmail: string | null,
): { id: string } | null {
  const lower = `${summary} ${description}`.toLowerCase();
  const lowerCoach = (coachEmail ?? "").toLowerCase();
  const emails = new Set(
    attendees.map((a) => (a.email ?? "").toLowerCase()).filter((e) => e && e !== lowerCoach),
  );
  for (const c of clients) {
    const ce = (c.email ?? "").toLowerCase();
    if (ce && ce !== lowerCoach && emails.has(ce)) return { id: c.id };
  }
  for (const c of clients) {
    const fn = (c.full_name ?? "").trim();
    if (!fn) continue;
    const parts = fn.split(/\s+/);
    const firstRaw = parts[0];
    if (!firstRaw || parts.length < 2) continue;
    const first = firstRaw.toLowerCase();
    const last = parts.slice(1).join(" ").toLowerCase();
    if (!first || !last) continue;
    if (lower.includes(`${first} ${last}`) || lower.includes(`${last} ${first}`))
      return { id: c.id };
  }
  return null;
}

function CalendarManageSheet({
  open,
  onOpenChange,
  coachId,
  connectedEmail,
  lastSyncAt,
  onDisconnect,
}: CalendarManageSheetProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDebugging, setIsDebugging] = useState(false);
  const [debugOutput, setDebugOutput] = useState<string | null>(null);
  const [isImportingOrphans, setIsImportingOrphans] = useState(false);
  const qc = useQueryClient();

  // Client-side recovery for bookings rejected by the edge function due
  // to the validate_booking_block_allocation trigger (alloc full →
  // INSERT raises P0001 → counter `imported` never increments).
  //
  // We replicate the edge function's matchEvent logic but INSERT with
  // block_id=NULL, which skips the trigger. The coach sees the events
  // in /trainer/calendar as "out of quota" rows they can later promote
  // by increasing the allocation or marking is_personal.
  //
  // Idempotent: skips events already in DB (by google_event_id).
  const handleImportOrphans = async () => {
    if (!coachId) return;
    setIsImportingOrphans(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const providerToken = sessionData?.session?.provider_token;
      if (!providerToken) {
        toast.error("Token Google scaduto", {
          description: "Disconnetti e ricollega Google, poi riprova subito.",
        });
        return;
      }

      const coachEmail = sessionData?.session?.user?.email ?? null;

      // Fetch clienti del coach (per match cliente da attendees / nome)
      const { data: clients, error: clientsErr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("coach_id", coachId)
        .is("deleted_at", null);
      if (clientsErr) throw clientsErr;

      // Fetch google_event_id già presenti (per dedup)
      const { data: existingBookings, error: existingErr } = await supabase
        .from("bookings")
        .select("google_event_id")
        .eq("coach_id", coachId)
        .not("google_event_id", "is", null);
      if (existingErr) throw existingErr;
      const existingIds = new Set(
        (existingBookings ?? [])
          .map((b) => b.google_event_id as string | null)
          .filter((id): id is string => !!id),
      );

      // Fetch tutti gli eventi Google nel range (1 Jan anno corrente → +2 anni)
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const twoYearsAhead = new Date();
      twoYearsAhead.setFullYear(twoYearsAhead.getFullYear() + 2);
      type GcalEvent = {
        id?: string;
        summary?: string;
        description?: string;
        status?: string;
        start?: { dateTime?: string; date?: string };
        attendees?: Array<{ email?: string }>;
      };
      const allItems: GcalEvent[] = [];
      let pageToken = "";
      do {
        const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
        url.searchParams.set("timeMin", yearStart);
        url.searchParams.set("timeMax", twoYearsAhead.toISOString());
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "250");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const r = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${providerToken}` },
        });
        if (!r.ok) {
          throw new Error(`Google API: ${r.status} ${await r.text().catch(() => "")}`);
        }
        const data = (await r.json()) as { items?: GcalEvent[]; nextPageToken?: string };
        allItems.push(...(data.items ?? []));
        pageToken = data.nextPageToken ?? "";
      } while (pageToken);

      // Filtra orfani: not cancelled, not in DB, valid start
      const orphans = allItems.filter((ev) => {
        if (!ev.id) return false;
        if (existingIds.has(ev.id)) return false;
        if (ev.status === "cancelled") return false;
        const s = ev.start?.dateTime ?? ev.start?.date;
        return !!s;
      });

      // INSERT one by one (no batch to keep error attribution clean)
      const now = Date.now();
      let inserted = 0;
      let failed = 0;
      for (const ev of orphans) {
        const summary = ev.summary ?? "Evento";
        const description = ev.description ?? "";
        const attendees = ev.attendees ?? [];
        const start = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
        if (!start) continue;

        const matched = matchClientFromEvent(
          summary,
          description,
          attendees,
          clients ?? [],
          coachEmail,
        );
        const status = new Date(start).getTime() < now ? "completed" : "scheduled";

        // end_at: required NOT NULL column (added by Lovable migration).
        // A trigger recomputes the value from duration_min when missing,
        // but we still need to satisfy the NOT NULL — set to start+60min
        // as placeholder; the trigger will overwrite if needed.
        const endAt = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
        const { error: insErr } = await supabase.from("bookings").insert({
          coach_id: coachId,
          client_id: matched?.id ?? null,
          scheduled_at: start,
          end_at: endAt,
          session_type: "PT Session",
          event_type_id: null,
          status,
          block_id: null, // ← bypassa trigger validate_booking_block_allocation
          notes: `Importato da Google Calendar (orfano): ${summary}`,
          title: summary,
          google_event_id: ev.id as string,
        });
        if (insErr) {
          console.error("Import orphan failed", ev.id, insErr);
          failed++;
        } else {
          inserted++;
        }
      }

      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });

      if (inserted === 0 && failed === 0) {
        toast.info("Nessun evento orfano trovato. Tutto già sincronizzato.");
      } else {
        toast.success(`Importati ${inserted} eventi orfani`, {
          description:
            failed > 0
              ? `${failed} non importati (vedi console). Causa probabile: RLS o trigger.`
              : "Visibili ora nel calendario. Senza credito scalato (block_id=null).",
        });
      }
    } catch (e) {
      console.error("handleImportOrphans error", e);
      toast.error("Importazione orfani fallita", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsImportingOrphans(false);
    }
  };

  const handleSyncNow = async () => {
    if (!coachId) return;
    setIsSyncing(true);
    // P1 (sync throttle): manual button always wins. Clear the gate
    // first so the next auto-sync cycle doesn't immediately skip on
    // top of our work, then stamp markAutoSyncDone() once the call
    // succeeds — the 10-minute window restarts from now.
    clearAutoSyncThrottle();
    try {
      // "Sincronizza ora" sweeps from 1 January of the current year to
      // +2 years out. import_history is idempotent: events with a known
      // google_event_id are detected as `existing` and only get their
      // metadata refreshed — no duplicate row is created. Brand-new
      // Google events become fresh bookings. Backdated events created
      // earlier in the year (e.g. a BIA logged retroactively in April)
      // get picked up on the very next click of this button.
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const twoYearsAhead = new Date();
      twoYearsAhead.setFullYear(twoYearsAhead.getFullYear() + 2);

      const { data, error } = await syncCalendarAwait({
        action: "import_history",
        coachId,
        rangeStartISO: yearStart,
        rangeEndISO: twoYearsAhead.toISOString(),
      });
      if (error) throw error;
      const result = data as {
        ok?: boolean;
        imported?: number;
        updated?: number;
        matched?: number;
        creditsBooked?: number;
        skipped?: boolean;
        error?: string;
      } | null;
      if (result?.error) {
        toast.error("Sincronizzazione non riuscita", { description: result.error });
      } else if (result?.skipped) {
        toast.info("Sincronizzazione saltata", {
          description: "Connetti Google Calendar per sincronizzare.",
        });
      } else {
        const parts: string[] = [];
        if (result?.imported) parts.push(`${result.imported} nuovi`);
        if (result?.updated) parts.push(`${result.updated} aggiornati`);
        if (result?.creditsBooked) parts.push(`${result.creditsBooked} crediti scalati`);
        toast.success(
          parts.length > 0
            ? `Sincronizzazione completata: ${parts.join(", ")}.`
            : "Sincronizzazione completata. Nessun nuovo evento.",
        );
        // Refresh the bookings caches so the calendar/dashboard pick up
        // newly imported rows without a manual page reload.
        qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
        qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
        markAutoSyncDone();
      }
    } catch (err) {
      console.error("sync-calendar import_history failed", err);
      toast.error("Sincronizzazione non riuscita", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-surface border-l border-surface-variant p-0 overflow-y-auto"
      >
        <div className="p-6 space-y-6">
          <SheetHeader className="space-y-1">
            <SheetTitle className="font-display text-2xl text-aura-primary">
              Gestisci Google Calendar
            </SheetTitle>
            <SheetDescription className="text-outline">
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
                  <Mail className="size-3.5 text-outline" />
                  <p className="text-sm font-medium text-aura-primary truncate">
                    {connectedEmail ?? "—"}
                  </p>
                </div>
                <p className="text-xs text-outline mt-0.5 flex items-center gap-1">
                  <Clock className="size-3" /> Ultima sincronizzazione:{" "}
                  {formatRelativeIt(lastSyncAt)}
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
              <h3 className="font-display text-base font-semibold text-aura-primary">
                Sincronizzazione manuale
              </h3>
              <p className="text-xs text-outline mt-1">
                Avvia subito un controllo per importare nuovi eventi.
              </p>
            </div>
            <Button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="w-full rounded-full bg-aura-primary hover:bg-on-primary-fixed text-white h-11"
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

            {/* Recovery button: imports Google events that the edge
                function couldn't insert (typically because the booking
                trigger validate_booking_block_allocation rejected the
                INSERT when the client's allocation was already full).
                Bookings are inserted with block_id=null so they bypass
                the trigger; the coach sees them as "out of quota" rows. */}
            <Button
              onClick={handleImportOrphans}
              disabled={isImportingOrphans || isSyncing || isDebugging}
              variant="outline"
              className="w-full rounded-full border-primary text-primary h-11"
            >
              {isImportingOrphans ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" /> Importazione orfani...
                </>
              ) : (
                "Importa eventi orfani da Google"
              )}
            </Button>

            {/* Diagnostic button — invokes the same import_history action
                but with debug=true, then dumps the full per-event tracing
                into a textarea so the coach can identify why specific
                events aren't being imported (missing match, paging, etc). */}
            <Button
              onClick={async () => {
                if (!coachId) return;
                setIsDebugging(true);
                setDebugOutput("Sincronizzazione diagnostica in corso...");
                try {
                  clearAutoSyncThrottle();
                  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
                  const twoYearsAhead = new Date();
                  twoYearsAhead.setFullYear(twoYearsAhead.getFullYear() + 2);
                  const { data, error } = await syncCalendarAwait({
                    action: "import_history",
                    coachId,
                    rangeStartISO: yearStart,
                    rangeEndISO: twoYearsAhead.toISOString(),
                    debug: true,
                  });
                  if (error) {
                    setDebugOutput(
                      `ERRORE: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
                    );
                  } else {
                    setDebugOutput(JSON.stringify(data, null, 2));
                  }
                } catch (e) {
                  setDebugOutput(`ERRORE: ${e instanceof Error ? e.message : String(e)}`);
                } finally {
                  setIsDebugging(false);
                }
              }}
              disabled={isDebugging || isSyncing}
              variant="outline"
              className="w-full rounded-full border-outline-variant text-on-surface-variant h-10"
            >
              {isDebugging ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" /> Diagnostica in corso...
                </>
              ) : (
                "Diagnostica sync (per debug)"
              )}
            </Button>
            {debugOutput && (
              <div className="space-y-2">
                <textarea
                  readOnly
                  value={debugOutput}
                  className="w-full h-64 text-[10px] font-mono p-2 rounded-xl border border-outline-variant bg-surface-container-low"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(debugOutput);
                    toast.success("Output copiato negli appunti");
                  }}
                  className="text-xs"
                >
                  Copia output
                </Button>
              </div>
            )}
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
      <h3 className="font-display text-lg font-semibold text-aura-primary mb-1">{title}</h3>
      <p className="text-sm text-outline mb-5 min-h-[40px]">{description}</p>
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

// L5 (FULL_APP_AUDIT.md): small badge with the access-token expiry. Helps
// coaches see at a glance whether the next sync is about to fail — the
// access token rotates ~every hour, but if the refresh token was revoked
// (account disconnected on Google's side) the access token expires and
// sync-calendar auto-disables gcal_enabled. This badge surfaces the
// last-known expiry so they can react before that happens.
function TokenExpiryBadge({ expiresAt }: { expiresAt: Date | null }) {
  if (!expiresAt) return null;
  const now = Date.now();
  const ms = expiresAt.getTime() - now;
  const expired = ms <= 0;
  const fmt = expiresAt.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const className = expired
    ? "inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 text-[11px] font-medium"
    : "inline-flex items-center gap-1.5 rounded-full bg-surface-container-low text-outline px-2.5 py-1 text-[11px] font-medium";
  const label = expired ? `Token scaduto (${fmt}) — verrà rinnovato` : `Token valido fino a ${fmt}`;
  return (
    <span className={className}>
      <Clock className="size-3" /> {label}
    </span>
  );
}

function StatusPill({ status }: { status: "connected" | "disconnected" | "error" }) {
  if (status === "connected") {
    // Aura Health System: --color-status-success-bg + --color-on-status-
    // success. Tokens live in src/styles.css; styled inline because they
    // aren't exposed as Tailwind utilities.
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
        style={{
          backgroundColor: "var(--color-status-success-bg)",
          color: "var(--color-on-status-success)",
        }}
      >
        <span
          className="size-1.5 rounded-full"
          style={{ backgroundColor: "var(--color-on-status-success)" }}
        />
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low text-outline px-3 py-1 text-xs font-medium">
      <span className="size-1.5 rounded-full bg-outline-variant" />
      Non connesso
    </span>
  );
}
