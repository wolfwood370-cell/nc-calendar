// ----------------------------------------------------------------------------
// Profilo cliente desktop (passata 06, da md in su)
// ----------------------------------------------------------------------------
// Brief design_handoff_coach_redesign/passes/06-profilo-cliente.md, prototipo
// designs/Coach Cliente.dc.html. Intestazione con contatti (K7), tab nell'URL
// (K2), Panoramica, Percorso con le settimane «da salvare» e la barra in basso
// (K1, K5), Sessioni con quelle fuori percorso (K3, K6).
// Uscita con modifiche al percorso non salvate (freccia, sidebar, cambio tab,
// altra pagina, chiusura): dialog «Salvare le modifiche al percorso?» con
// useBlocker di TanStack Router.
// Scritture: le sessioni con gli helper del Calendario (profile-session.ts);
// il calendario del percorso con saveSchedule di prima; il rinnovo automatico
// con la stessa scrittura di prima su profiles.auto_renew_blocks.
// Le Limitazioni (K4) restano fuori: servono una colonna e una migrazione.
// ----------------------------------------------------------------------------

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Link,
  useBlocker,
  useNavigate,
  useParams,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CalendarPlus,
  Loader2,
  Mail,
  MessageCircle,
  Package,
  Phone,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  CoachAlertDialog,
  CoachAlertDialogCancel,
  CoachAlertDialogContent,
  CoachAlertDialogDescription,
  CoachAlertDialogTitle,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { CoachPage } from "@/components/coach-page";
import { PackageDialog } from "@/components/package-dialog";
import { PageTitle } from "@/components/page-title";
import { ProfileOverview } from "@/components/profile-overview";
import { ProfilePath } from "@/components/profile-path";
import { ProfileSessionDialog } from "@/components/profile-session-dialog";
import { ProfileSessions } from "@/components/profile-sessions";
import { SegmentedControl } from "@/components/segmented-control";
import { SessionCancelDialog } from "@/components/session-cancel-dialog";
import { supabase } from "@/integrations/supabase/client";
import { undoAssign } from "@/lib/assign-event";
import { profilePresence } from "@/lib/attendance";
import { useAuth } from "@/lib/auth";
import { CreditUnavailableError, type SessionRemoval } from "@/lib/cancel-session";
import { whatsappUrl } from "@/lib/calendar-events";
import { backToListSearch, clientStatus, STATUS_LABEL, type ClientStatus } from "@/lib/client-list";
import {
  blockChip,
  buildWeekRows,
  changedWeeks,
  dirtyLabel,
  leavesSchedule,
  mondayOf,
  moveWeek,
  opensPackage,
  packageCta,
  packageSummary,
  profileSearchOf,
  profileTab,
  rebaseWeeks,
  regenerateWeeks,
  renewalControl,
  type ProfileSearch,
  type ProfileTab,
  type WeekRow,
} from "@/lib/client-profile";
import { clientPlanLabel } from "@/lib/client-search";
import type { PackageMode } from "@/lib/package-actions";
import { loadClientProfile, type ProfileBooking, type ProfileOrphan } from "@/lib/profile-load";
import {
  ignoreOrphan,
  linkOrphan,
  orphanType,
  unignoreOrphan,
  unlinkFromClient,
} from "@/lib/profile-session";
import { supabaseProfileStore } from "@/lib/profile-store";
import { useCoachEventTypes } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { getRenewalInfo } from "@/lib/renewal";
import { toastWithUndo, UNDO_TOAST_DURATION } from "@/lib/toast";
import { initials } from "@/lib/initials";
import { cn, errorMessage } from "@/lib/utils";
import { format, parseISO } from "date-fns";

const STATUS_TONE: Record<ClientStatus, string> = {
  active: "bg-success-soft text-success-text",
  expiring: "bg-warning-soft text-warning-text",
  completed: "bg-surface-container text-on-surface-variant",
  archived: "bg-surface-container text-on-surface-variant",
};

const TABS: ReadonlyArray<{ value: ProfileTab; label: string }> = [
  { value: "panoramica", label: "Panoramica" },
  { value: "percorso", label: "Percorso" },
  { value: "sessioni", label: "Sessioni" },
];

interface Schedule {
  rows: WeekRow[];
  saved: WeekRow[];
  start: string | null;
  savedStart: string | null;
}

export function ClientProfileDesktop({
  onDirtyChange,
}: {
  /** La route tiene questa versione anche sotto md finché ci sono modifiche da salvare. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { id: clientId } = useParams({ from: "/trainer/clients/$id" });
  const search = useSearch({ from: "/trainer/clients/$id" });
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const eventTypes = useCoachEventTypes(user?.id).data ?? [];
  const tab = profileTab(search);
  const now = new Date();

  const dataQ = useQuery({
    queryKey: ["client-profile", clientId, user?.id],
    enabled: !!user,
    queryFn: () => loadClientProfile(clientId, user!.id),
  });
  const data = dataQ.data ?? null;
  const client = data?.client ?? null;
  const clientName = client?.full_name ?? client?.email ?? "Cliente";

  // Cliente inesistente o di un altro coach: come la pagina di prima.
  useEffect(() => {
    if (dataQ.isSuccess && dataQ.data === null) {
      toast.error("Cliente non trovato o non autorizzato.");
      void navigate({ to: "/trainer/clients" });
    }
  }, [dataQ.isSuccess, dataQ.data, navigate]);

  // Come prima: le sessioni assegnate da Google negli ultimi 5 minuti (una volta per apertura).
  const autoToastDone = useRef(false);
  useEffect(() => {
    if (!data || autoToastDone.current) return;
    autoToastDone.current = true;
    const since = Date.now() - 5 * 60 * 1000;
    const n = data.bookings.filter(
      (b) => b.google_event_id && new Date(b.created_at).getTime() > since,
    ).length;
    if (n > 0) {
      toast.success(
        `Ho assegnato automaticamente ${n} ${n === 1 ? "nuova sessione" : "nuove sessioni"} a questo cliente.`,
      );
    }
  }, [data]);

  function refresh() {
    void dataQ.refetch();
    qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.bookings.client(clientId) });
    qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.client(clientId) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.extraCredits.client(clientId) });
    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
  }

  // ---------------------------------------------------------------- percorso
  const [sched, setSched] = useState<Schedule>({
    rows: [],
    saved: [],
    start: null,
    savedStart: null,
  });
  useEffect(() => {
    if (!data) return;
    const server = buildWeekRows(data.blocks.length, data.client.path_start_date, data.weeks);
    const serverStart = data.client.path_start_date;
    // Le settimane non ancora salvate restano del coach anche dopo un ricaricamento.
    setSched((prev) => ({
      rows: rebaseWeeks(server, prev.saved, prev.rows),
      saved: server,
      start: prev.start !== prev.savedStart ? prev.start : serverStart,
      savedStart: serverStart,
    }));
  }, [data]);

  const changedCount = changedWeeks(sched.rows, sched.saved).length;
  const startChanged = sched.start !== sched.savedStart;
  const dirty = changedCount > 0 || startChanged;
  const dirtyText = dirtyLabel(changedCount, startChanged);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const [savingSchedule, setSavingSchedule] = useState(false);

  /** saveSchedule di prima (trainer.clients.$id.tsx:682-721 su main). */
  async function saveSchedule(): Promise<boolean> {
    if (!user) return false;
    if (!sched.start) {
      toast.error("Imposta una data di inizio percorso prima di salvare");
      return false;
    }
    const rows = sched.rows;
    const start = sched.start;
    setSavingSchedule(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ path_start_date: start })
        .eq("id", clientId);
      if (pErr) throw pErr;
      const { error: dErr } = await supabase
        .from("weekly_schedule")
        .delete()
        .eq("client_id", clientId);
      if (dErr) throw dErr;
      if (rows.length > 0) {
        const { error: iErr } = await supabase.from("weekly_schedule").insert(
          rows.map((r) => ({
            client_id: clientId,
            coach_id: user.id,
            week_number: r.week_number,
            block_number: r.block_number,
            monday_date: r.monday_date,
            shifted: r.shifted,
          })),
        );
        if (iErr) throw iErr;
      }
      setSched((prev) => ({ ...prev, saved: rows, savedStart: start }));
      toast.success("Calendario del percorso salvato.");
      refresh();
      return true;
    } catch (e) {
      toast.error("Salvataggio non riuscito", { description: errorMessage(e) });
      return false;
    } finally {
      setSavingSchedule(false);
    }
  }

  function discardSchedule() {
    setSched((prev) => ({ ...prev, rows: prev.saved, start: prev.savedStart }));
  }

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) =>
      dirtyRef.current &&
      leavesSchedule(
        { pathname: current.pathname, search: current.search as ProfileSearch },
        { pathname: next.pathname, search: next.search as ProfileSearch },
      ),
    enableBeforeUnload: () => dirtyRef.current,
    withResolver: true,
  });

  // ------------------------------------------------------------------- tab
  function goTab(t: ProfileTab) {
    void navigate({
      to: "/trainer/clients/$id",
      params: { id: clientId },
      search: profileSearchOf(t),
      replace: true,
      state: (prev) => prev,
    });
  }

  // tab=pacchetto apre il dialog Pacchetto sulla panoramica, poi si toglie.
  const [packageMode, setPackageMode] = useState<PackageMode | "auto" | null>(null);
  useEffect(() => {
    if (!opensPackage(search)) return;
    setPackageMode("auto");
    void navigate({
      to: "/trainer/clients/$id",
      params: { id: clientId },
      search: {},
      replace: true,
      state: (prev) => prev,
    });
  }, [search, clientId, navigate]);

  // Ritorno alla lista Clienti con ricerca, tab, ordine e vista di prima (05).
  const listState = useRouterState({ select: (s) => s.location.state.clientsSearch });
  const listSearch = useMemo(() => backToListSearch({ clientsSearch: listState }), [listState]);

  // --------------------------------------------------------------- derivati
  const blocks = data?.blocks ?? [];
  const allocations = data?.allocations ?? [];
  const bookings = data?.bookings ?? [];
  const renewalClient = client
    ? {
        status: client.status,
        path_type: client.path_type,
        auto_renew_blocks: client.auto_renew_blocks,
      }
    : null;
  const renewal = renewalClient ? getRenewalInfo(renewalClient, blocks, allocations, now) : null;
  const status: ClientStatus | null = client
    ? clientStatus(
        { ...client, auto_renew_blocks: client.auto_renew_blocks },
        blocks.map((b) => ({ ...b, client_id: client.id })),
        allocations,
        bookings.map((b) => ({ ...b, client_id: client.id })),
        now,
      )
    : null;
  const summary = packageSummary(client?.path_type ?? null, blocks, allocations, now);
  // V5: le sessioni che conta anche la lista Clienti (solo le sue per il coach).
  const presence = profilePresence(
    bookings,
    { id: user?.id ?? "", isAdmin: role === "admin" },
    now,
  );
  const chip = blockChip(client?.path_type ?? null, blocks, now);
  const wa = whatsappUrl(client?.phone);
  const control = renewalControl(client?.path_type ?? null, client?.auto_renew_blocks ?? null);

  // ------------------------------------------------------ rinnovo automatico
  const [renewalSaving, setRenewalSaving] = useState(false);

  /** La scrittura di prima (toggleAutoRenew, trainer.clients.$id.tsx:655-680 su main). */
  async function setAutoRenew(next: boolean, withUndo = true) {
    if (renewalSaving) return;
    setRenewalSaving(true);
    const sb = supabase as unknown as {
      from: (t: "profiles") => {
        update: (vals: { auto_renew_blocks: boolean }) => {
          eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const { error } = await sb
      .from("profiles")
      .update({ auto_renew_blocks: next })
      .eq("id", clientId);
    setRenewalSaving(false);
    if (error) {
      toast.error("Errore aggiornamento", { description: error.message });
      return;
    }
    refresh();
    const msg = next ? "Rinnovo automatico attivato." : "Rinnovo automatico disattivato.";
    if (withUndo) toastWithUndo(msg, () => void setAutoRenew(!next, false));
    else toast.success(msg);
  }

  // ------------------------------------------------------------- sessioni
  const [editing, setEditing] = useState<ProfileBooking | null>(null);
  const [removal, setRemoval] = useState<{
    booking: ProfileBooking;
    removal: SessionRemoval;
  } | null>(null);
  const [unlinking, setUnlinking] = useState<ProfileBooking | null>(null);
  const [busyOrphan, setBusyOrphan] = useState<string | null>(null);

  function blockName(blockId: string | null): string | null {
    const b = blockId ? blocks.find((x) => x.id === blockId) : null;
    return b ? `blocco ${b.sequence_order}` : null;
  }

  async function linkOne(o: ProfileOrphan, useCredit = true) {
    const type = orphanType(o, eventTypes);
    if (!type) {
      toast.error("Crea prima una tipologia di sessione.");
      return;
    }
    setBusyOrphan(o.id);
    try {
      const r = await linkOrphan(supabaseProfileStore, {
        eventId: o.id,
        clientId,
        type: { id: type.id, base_type: type.base_type },
        useCredit,
      });
      refresh();
      const where = blockName(r.next.block_id);
      const msg = !r.credit
        ? "Sessione collegata senza credito."
        : where
          ? `Sessione collegata al ${where}.`
          : "Sessione collegata, credito dagli extra.";
      toastWithUndo(msg, () => {
        void undoAssign(supabaseProfileStore, r)
          .then(() => {
            refresh();
            toast.success("Sessione di nuovo fuori percorso.");
          })
          .catch((e: unknown) => toast.error(errorMessage(e)));
      });
    } catch (e) {
      if (e instanceof CreditUnavailableError && useCredit) {
        toast.error(`${clientName} non ha crediti di ${type.name} per quella data.`, {
          duration: UNDO_TOAST_DURATION,
          action: { label: "Collega senza credito", onClick: () => void linkOne(o, false) },
        });
      } else {
        toast.error(errorMessage(e));
      }
    } finally {
      setBusyOrphan(null);
    }
  }

  async function ignoreOne(o: ProfileOrphan) {
    setBusyOrphan(o.id);
    try {
      await ignoreOrphan(supabaseProfileStore, o.id, clientId);
      refresh();
      toastWithUndo("Sessione ignorata per questo cliente.", () => {
        void unignoreOrphan(supabaseProfileStore, o.id, clientId)
          .then(refresh)
          .catch((e: unknown) => toast.error(errorMessage(e)));
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyOrphan(null);
    }
  }

  async function unlinkOne(b: ProfileBooking) {
    try {
      const r = await unlinkFromClient(supabaseProfileStore, b.id, clientId);
      if (r.creditReturned === false) {
        toast.error("Il credito non è stato restituito.", {
          description: "Controlla i crediti del blocco dal profilo.",
        });
      }
      toast.success("Sessione scollegata dal profilo.");
    } catch (e) {
      toast.error("Scollegamento non riuscito", { description: errorMessage(e) });
    } finally {
      setUnlinking(null);
      refresh();
    }
  }

  // ------------------------------------------------------------------ vista
  if (!data || !client) {
    return (
      <CoachPage saveBar className="grid place-items-center py-24 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" aria-label="Caricamento" />
      </CoachPage>
    );
  }

  const cta = packageCta(client.path_type, blocks.length > 0, !!renewal);

  return (
    <CoachPage saveBar className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center justify-between gap-5 rounded-[28px] bg-surface-container-lowest p-6 shadow-soft-blue">
        <div className="flex min-w-0 items-center gap-[18px]">
          <Link
            to="/trainer/clients"
            search={listSearch}
            aria-label="Torna ai clienti"
            className="grid size-[38px] shrink-0 place-items-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <ArrowLeft className="size-[18px]" aria-hidden />
          </Link>
          <span className="grid size-[72px] shrink-0 place-items-center rounded-full bg-avatar-placeholder text-2xl font-extrabold text-on-avatar-placeholder">
            {initials(client.full_name, client.email)}
          </span>
          <div className="flex min-w-0 flex-col gap-2">
            <PageTitle className="m-0">{clientName}</PageTitle>
            <div className="flex flex-wrap gap-1.5">
              {status && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-[3px] text-[11px] font-bold",
                    STATUS_TONE[status],
                  )}
                >
                  {STATUS_LABEL[status]}
                </span>
              )}
              <span className="rounded-full bg-aura-primary/[0.08] px-2.5 py-[3px] text-[11px] font-bold text-aura-primary">
                {clientPlanLabel(client)}
              </span>
              {chip && (
                <span className="rounded-full bg-surface-container px-2.5 py-[3px] text-[11px] font-bold text-on-surface-variant">
                  {chip}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3.5 text-[13px]">
              {client.email && (
                <a
                  href={`mailto:${client.email}`}
                  className="flex items-center gap-1.5 text-on-surface-variant hover:text-aura-primary"
                >
                  <Mail className="size-3.5" aria-hidden />
                  {client.email}
                </a>
              )}
              {client.phone && (
                <a
                  href={`tel:${client.phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-1.5 text-on-surface-variant hover:text-aura-primary"
                >
                  <Phone className="size-3.5" aria-hidden />
                  {client.phone}
                </a>
              )}
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 font-semibold text-[#0b8043]"
                >
                  <MessageCircle className="size-3.5" aria-hidden />
                  WhatsApp
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/trainer/calendar"
            search={{ new: "sessione", client: clientId }}
            className="flex h-[42px] items-center gap-2 rounded-full bg-surface-container px-[18px] text-sm font-semibold text-aura-primary hover:bg-surface-variant"
          >
            <CalendarPlus className="size-4" aria-hidden />
            Nuova sessione
          </Link>
          <button
            type="button"
            onClick={() => setPackageMode(renewal ? "renew" : "auto")}
            className="flex h-[42px] items-center gap-2 rounded-full bg-aura-primary px-[18px] text-sm font-semibold text-white hover:bg-primary-container"
          >
            <Package className="size-4" aria-hidden />
            {cta}
          </button>
        </div>
      </section>

      <SegmentedControl
        kind="tabs"
        size="tab"
        ariaLabel="Sezioni del profilo"
        className="w-fit"
        itemClassName="px-[18px]"
        value={tab}
        onChange={goTab}
        options={TABS.map((t) => {
          const badge = t.value === "sessioni" ? data.orphans.length : 0;
          return {
            value: t.value,
            label: (
              <>
                {t.label}
                {badge > 0 && (
                  <span
                    aria-label={`${badge} fuori percorso`}
                    className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[rgba(124,67,2,0.14)] px-[5px] text-[11px] font-bold text-[#7c4302]"
                  >
                    {badge}
                  </span>
                )}
              </>
            ),
          };
        })}
      />

      {tab === "panoramica" && user && (
        <ProfileOverview
          clientId={clientId}
          coachId={user.id}
          pathType={client.path_type}
          bookings={bookings}
          extras={data.extras}
          eventTypes={eventTypes}
          summary={summary}
          renewal={renewal}
          presence={presence}
          now={now}
          onGoPath={() => goTab("percorso")}
          onGoSessions={() => goTab("sessioni")}
          onRenew={() => setPackageMode("renew")}
          onEdit={setEditing}
        />
      )}

      {tab === "percorso" && (
        <ProfilePath
          clientName={clientName}
          pathType={client.path_type}
          blocks={blocks}
          allocations={allocations}
          bookings={bookings}
          eventTypes={eventTypes}
          rows={sched.rows}
          savedRows={sched.saved}
          pathStart={sched.start}
          renewal={control}
          renewalSaving={renewalSaving}
          now={now}
          onMoveWeek={(idx, d) => setSched((p) => ({ ...p, rows: moveWeek(p.rows, idx, d) }))}
          onStartChange={(d) => {
            const m = mondayOf(d);
            setSched((p) => ({
              ...p,
              start: format(m, "yyyy-MM-dd"),
              rows: regenerateWeeks(p.rows, m),
            }));
          }}
          onStandardDates={() =>
            setSched((p) =>
              p.start ? { ...p, rows: regenerateWeeks(p.rows, parseISO(p.start)) } : p,
            )
          }
          onRenewalChange={(on) => void setAutoRenew(on)}
          onEdit={setEditing}
          onAssignPath={() => setPackageMode("path")}
          onCreditsSaved={refresh}
        />
      )}

      {tab === "sessioni" && (
        <ProfileSessions
          bookings={bookings}
          orphans={data.orphans}
          blocks={blocks}
          eventTypes={eventTypes}
          now={now}
          busy={busyOrphan}
          onLink={(o) => void linkOne(o)}
          onIgnore={(o) => void ignoreOne(o)}
          onEdit={setEditing}
        />
      )}

      {/* Barra fissa sulla finestra: in un portal, perché il contenitore
          dell'animazione d'ingresso (.page-enter) ha un transform e un fixed
          dentro di lui scorrerebbe con la pagina. */}
      {dirty &&
        createPortal(
          <div
            role="region"
            aria-label="Modifiche non salvate"
            className="fixed bottom-6 left-[calc(256px+24px)] right-6 z-40 flex flex-wrap items-center justify-between gap-4 rounded-[20px] bg-[#191c1f] py-3.5 pl-5 pr-4 text-white shadow-[0_20px_60px_rgba(0,0,0,0.3)]"
          >
            <span className="flex items-center gap-2.5 text-sm font-semibold">
              <CalendarClock className="size-[18px]" aria-hidden />
              {dirtyText}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={discardSchedule}
                disabled={savingSchedule}
                className="h-[38px] rounded-full border border-white/30 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Annulla modifiche
              </button>
              <button
                type="button"
                onClick={() => void saveSchedule()}
                disabled={savingSchedule}
                className="flex h-[38px] items-center gap-2 rounded-full bg-white px-[18px] text-sm font-bold text-aura-primary disabled:opacity-60"
              >
                {savingSchedule && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Salva calendario
              </button>
            </div>
          </div>,
          document.body,
        )}

      <CoachAlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(o) => !o && blocker.status === "blocked" && blocker.reset()}
      >
        <CoachAlertDialogContent>
          <CoachAlertDialogTitle>Salvare le modifiche al percorso?</CoachAlertDialogTitle>
          <CoachAlertDialogDescription className="text-sm leading-normal text-on-surface-variant">
            {dirtyText}. Se esci senza salvare vanno perse.
          </CoachAlertDialogDescription>
          <div className="flex flex-wrap justify-end gap-2">
            <CoachAlertDialogCancel className={dialogSecondaryButton}>
              Resta qui
            </CoachAlertDialogCancel>
            <button
              type="button"
              disabled={savingSchedule}
              onClick={() => {
                discardSchedule();
                blocker.proceed?.();
              }}
              className="inline-flex h-10 items-center rounded-full border border-surface-variant px-4 text-sm font-semibold text-danger-text disabled:opacity-60"
            >
              Esci senza salvare
            </button>
            <button
              type="button"
              disabled={savingSchedule}
              onClick={async () => {
                if (await saveSchedule()) blocker.proceed?.();
                else blocker.reset?.();
              }}
              className={dialogPrimaryButton}
            >
              {savingSchedule && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Salva ed esci
            </button>
          </div>
        </CoachAlertDialogContent>
      </CoachAlertDialog>

      <ProfileSessionDialog
        booking={editing}
        clientName={clientName}
        eventTypes={eventTypes}
        onClose={() => setEditing(null)}
        onChanged={refresh}
        onCancelSession={(b) => {
          setEditing(null);
          setRemoval({ booking: b, removal: "cancel" });
        }}
        onDeleteSession={(b) => {
          setEditing(null);
          setRemoval({ booking: b, removal: "delete" });
        }}
        onUnlink={(b) => {
          setEditing(null);
          setUnlinking(b);
        }}
      />

      <SessionCancelDialog
        session={
          removal
            ? {
                ...removal.booking,
                client_id: clientId,
                coach_id: user?.id ?? null,
                is_personal: false,
              }
            : null
        }
        removal={removal?.removal ?? "cancel"}
        clientName={clientName}
        typeName={
          removal?.booking.event_type_id
            ? (eventTypes.find((e) => e.id === removal.booking.event_type_id)?.name ?? null)
            : null
        }
        onClose={() => setRemoval(null)}
        onChanged={refresh}
      />

      <CoachAlertDialog open={!!unlinking} onOpenChange={(o) => !o && setUnlinking(null)}>
        <CoachAlertDialogContent>
          <CoachAlertDialogTitle>Scollegare la sessione dal profilo?</CoachAlertDialogTitle>
          <CoachAlertDialogDescription className="text-sm leading-normal text-on-surface-variant">
            La sessione resta in calendario tra gli eventi da assegnare e non viene più abbinata a
            questo cliente. Se era stato scalato un credito, torna disponibile.
          </CoachAlertDialogDescription>
          <div className="flex justify-end gap-2">
            <CoachAlertDialogCancel className={dialogSecondaryButton}>
              Annulla
            </CoachAlertDialogCancel>
            <button
              type="button"
              className={dialogPrimaryButton}
              onClick={() => unlinking && void unlinkOne(unlinking)}
            >
              Scollega
            </button>
          </div>
        </CoachAlertDialogContent>
      </CoachAlertDialog>

      <PackageDialog
        clientId={packageMode ? clientId : null}
        initialMode={packageMode === "auto" ? undefined : (packageMode ?? undefined)}
        onClose={() => setPackageMode(null)}
        onChanged={refresh}
      />
    </CoachPage>
  );
}
