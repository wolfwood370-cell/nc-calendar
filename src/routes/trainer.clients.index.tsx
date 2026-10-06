import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Plus, Search, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { attendanceCoachId } from "@/lib/attendance";
import { useNow } from "@/hooks/use-now";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { sendInvitationEmail } from "@/lib/email";
import { useCoachEventTypes } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { parseEdgeError } from "@/lib/edge-function-error";
import type { SessionType } from "@/lib/mock-data";
import {
  AuraCardSkeleton,
  AuraAvatarSkeleton,
  AuraLineSkeleton,
  AuraPillSkeleton,
} from "@/components/ui/aura-skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { CreateClientDialog, type CreateClientPayload } from "@/components/create-client-dialog";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { ClientStatusTabs } from "@/components/client-status-tabs";
import { ClientsDesktop, type PendingInvitation } from "@/components/clients-desktop";
import type { InviteInput } from "@/components/new-client-dialog";
import { initials } from "@/lib/initials";
import {
  ActionConflictError,
  cancelInvitation,
  invitationWriteError,
  restoreInvitation,
  sentAgo,
  setArchived,
  undoArchive,
} from "@/lib/client-actions";
import {
  writeNewClient,
  type CreateClientResult,
  type NewClientPayload,
} from "@/lib/client-create";
import {
  buildClientRows,
  parseClientsSearch,
  type ClientRow,
  type ClientStatus,
} from "@/lib/client-list";
import { supabaseClientActionsStore, supabaseClientCreateStore } from "@/lib/client-stores";
import { toastWithUndo } from "@/lib/toast";

// Stato della lista nell'URL (passata 05, audit T4): q, stato, vista, ordina;
// new=cliente (menu «Nuovo» dell'header) apre «Nuovo cliente» e poi si toglie.
export const Route = createFileRoute("/trainer/clients/")({
  validateSearch: parseClientsSearch,
  head: () => ({
    meta: [
      { title: "Clienti · NC Calendar" },
      {
        name: "description",
        content: "Elenco dei clienti con stato dei percorsi e crediti residui.",
      },
      { property: "og:title", content: "Clienti · NC Calendar" },
      {
        property: "og:description",
        content: "Elenco dei clienti con stato dei percorsi e crediti residui.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientsPage,
});

interface ClientRecord {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  path_type: "fixed" | "recurring" | "free";
  next_billing_date: string | null;
  pack_label: string | null;
  // Canonical auto-renew flag for monthly blocks (per migration
  // 20260524110000_block_auto_renew.sql). The legacy `auto_renew`
  // column is left in the schema for back-compat with onboarding form
  // serialization but is no longer the source of truth.
  auto_renew_blocks: boolean;
}
interface InvitationRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}
interface BlockLite {
  id: string;
  client_id: string;
  sequence_order: number;
  start_date: string;
  end_date: string;
  // training_blocks.status: serve a «In scadenza» (renewal.ts).
  status: string;
}
interface AllocLite {
  block_id: string;
  event_type_id: string | null;
  session_type: SessionType;
  quantity_assigned: number;
  quantity_booked: number;
}
interface BookingLite {
  id: string;
  client_id: string;
  block_id: string | null;
  event_type_id: string | null;
  session_type: string;
  status: string;
  scheduled_at: string;
  ignored_by_clients?: string[] | null;
}
interface ExtraLite {
  client_id: string;
  quantity: number;
  quantity_booked: number;
  expires_at: string;
}

function ClientsPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [blocks, setBlocks] = useState<BlockLite[]>([]);
  const [allocs, setAllocs] = useState<AllocLite[]>([]);
  const [bookings, setBookings] = useState<BookingLite[]>([]);
  const [extras, setExtras] = useState<ExtraLite[]>([]);
  const [loading, setLoading] = useState(true);

  // Telefono: ricerca e tab restano locali, come prima della passata 05.
  const [q, setQ] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | ClientStatus>("all");

  const isAdmin = role === "admin";
  const eventTypesQ = useCoachEventTypes(user?.id);

  // HIGH-4 (audit 2026-05-26): `signal` è un piccolo flag mutevole passato
  // dal useEffect chiamante. Se il componente unmount mid-fetch, l'effect
  // cleanup setta signal.cancelled=true e tutti i setState successivi
  // diventano no-op. Default `{ cancelled: false }` per i caller manuali
  // (post-mutation reload) dove il rischio unmount è zero.
  async function load(signal: { cancelled: boolean } = { cancelled: false }) {
    setLoading(true);
    let cq = supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, status, path_type, next_billing_date, pack_label, auto_renew_blocks",
      )
      .is("deleted_at", null);
    if (!isAdmin && user) cq = cq.eq("coach_id", user.id);
    const { data: cs } = await cq;
    if (signal.cancelled) return;
    const clientList = ((cs as ClientRecord[]) ?? [])
      .slice()
      .sort((a, b) =>
        (a.full_name ?? "").localeCompare(b.full_name ?? "", "it", { sensitivity: "base" }),
      );
    setClients(clientList);

    let iq = supabase
      .from("client_invitations")
      .select("id, email, full_name, phone, status, created_at")
      .order("created_at", { ascending: false });
    if (!isAdmin && user) iq = iq.eq("coach_id", user.id);
    const { data: invs } = await iq;
    if (signal.cancelled) return;
    setInvitations((invs as InvitationRow[]) ?? []);

    // Blocchi e allocazioni per stato e crediti.
    const ids = clientList.map((c) => c.id);
    if (ids.length > 0) {
      let bq = supabase
        .from("training_blocks")
        .select(
          `
          id, client_id, sequence_order, start_date, end_date, status,
          block_allocations (
            block_id, event_type_id, session_type, quantity_assigned, quantity_booked
          )
        `,
        )
        .in("client_id", ids)
        .is("deleted_at", null)
        .order("sequence_order", { ascending: true });
      if (!isAdmin && user) bq = bq.eq("coach_id", user.id);

      const { data: bs } = await bq;
      if (signal.cancelled) return;
      type BlockWithAllocs = BlockLite & { block_allocations: AllocLite[] | null };
      const blockList = (bs ?? []) as BlockWithAllocs[];

      const parsedBlocks: BlockLite[] = [];
      const parsedAllocs: AllocLite[] = [];
      for (const b of blockList) {
        parsedBlocks.push({
          id: b.id,
          client_id: b.client_id,
          sequence_order: b.sequence_order,
          start_date: b.start_date,
          end_date: b.end_date,
          status: b.status,
        });
        if (b.block_allocations) {
          for (const a of b.block_allocations) {
            parsedAllocs.push(a);
          }
        }
      }
      setBlocks(parsedBlocks);
      setAllocs(parsedAllocs);

      // Live bookings: source of truth for "completed" counters
      let bookQ = supabase
        .from("bookings")
        .select(
          "id, client_id, block_id, event_type_id, session_type, status, scheduled_at, ignored_by_clients",
        )
        .in("client_id", ids)
        .is("deleted_at", null)
        // no_show incluso SOLO per la presenza: il conteggio del percorso
        // (pathProgress) filtra di nuovo per stato.
        .in("status", ["scheduled", "completed", "late_cancelled", "no_show"]);
      // Lo stesso sottoinsieme della presenza del Profilo (attendance.ts, V5).
      const coach = user ? attendanceCoachId({ id: user.id, isAdmin }) : null;
      if (coach) bookQ = bookQ.eq("coach_id", coach);
      const { data: bks } = await bookQ;
      if (signal.cancelled) return;
      setBookings((bks as unknown as BookingLite[]) ?? []);

      // Crediti extra dei clienti liberi («Crediti extra» in scheda, L8).
      const { data: ecs } = await supabase
        .from("extra_credits")
        .select("client_id, quantity, quantity_booked, expires_at")
        .in("client_id", ids);
      if (signal.cancelled) return;
      setExtras((ecs as ExtraLite[]) ?? []);
    } else {
      if (signal.cancelled) return;
      setBlocks([]);
      setAllocs([]);
      setBookings([]);
      setExtras([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (!user) return;
    // On mount, ask the server to reconcile every recurring client's
    // block state in a single round-trip (closes expired blocks past
    // their grace + auto-creates successors). The RPC is idempotent
    // and silently skips clients with auto_renew_blocks=false, so
    // running it for every coach mount is safe and cheap.
    //
    // Wrapped in IIFE so load() runs once the RPC settles — that
    // guarantees the immediately-following SELECT picks up the rows
    // just inserted. Admin role skips the call because they don't
    // have a single coach scope; their dashboard shows everyone.
    //
    // HIGH-4 (audit 2026-05-26): cleanup pattern. Se l'utente naviga
    // via questa route prima che `load()` finisca, il flag
    // `signal.cancelled` viene settato dal cleanup ritornato e i setState
    // successivi diventano no-op.
    const signal = { cancelled: false };
    void (async () => {
      if (!isAdmin) {
        try {
          await (
            supabase as unknown as {
              rpc: (
                fn: "ensure_all_recurring_for_coach",
                args: { p_coach_id: string },
              ) => Promise<{ data: number | null; error: { message: string } | null }>;
            }
          ).rpc("ensure_all_recurring_for_coach", { p_coach_id: user.id });
        } catch (e) {
          // Non-fatal — the per-client lazy ensure in client.book.tsx
          // still covers the case. We log so failures show up in
          // error capture without breaking the dashboard.
          console.error("ensure_all_recurring_for_coach failed", e);
        }
      }
      if (signal.cancelled) return;
      load(signal);
    })();
    return () => {
      signal.cancelled = true;
    };
    // HIGH-5: `load` è una funzione locale stabile per scopo — chiude su
    // `user`, `isAdmin` (entrambi nei deps) e su setState refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  // Stato, crediti, presenza e prossima sessione di ogni cliente (client-list.ts).
  // L'ora è quella di Panoramica e Calendario, e scorre (V8): prima era
  // new Date() dentro il memo, ferma finché i dati non cambiavano.
  const now = useNow();
  const rows = useMemo<ClientRow[]>(
    () => buildClientRows({ clients, blocks, allocations: allocs, bookings, extras }, now),
    [clients, blocks, allocs, bookings, extras, now],
  );

  const counts = useMemo(() => {
    const c = { all: rows.length, active: 0, expiring: 0, archived: 0, completed: 0 };
    for (const d of rows) c[d.status]++;
    return c;
  }, [rows]);

  // Telefono: filtro e ordine di prima (nome o email, per nome).
  const visibleCards = useMemo(() => {
    const term = q.toLowerCase();
    const filtered = rows.filter((d) => {
      if (activeTab !== "all" && d.status !== activeTab) return false;
      if (activeTab === "all" && d.status === "archived") return false;
      if (!term) return true;
      return (
        (d.client.full_name ?? "").toLowerCase().includes(term) ||
        (d.client.email ?? "").toLowerCase().includes(term)
      );
    });
    return [...filtered].sort((a, b) =>
      (a.client.full_name ?? "").localeCompare(b.client.full_name ?? "", "it"),
    );
  }, [rows, activeTab, q]);

  const pending: PendingInvitation[] = useMemo(() => {
    return invitations
      .filter((i) => i.status === "pending")
      .map((i) => ({
        id: i.id,
        email: i.email,
        full_name: i.full_name,
        created_at: i.created_at,
        sent: sentAgo(i.created_at, now),
      }));
  }, [invitations, now]);

  const coachName = (user?.user_metadata?.full_name as string) || user?.email || "il tuo coach";

  async function inviteClient(data: InviteInput): Promise<boolean> {
    if (!user) return false;
    const { error } = await supabase.from("client_invitations").insert({
      email: data.email.toLowerCase().trim(),
      full_name: data.name,
      phone: data.phone || null,
      coach_id: user.id,
    });
    if (error) {
      // N5: non esporre error.message raw (può rivelare struttura DB / RLS hints).
      console.error("invite create failed", error);
      toast.error("Invito non riuscito", { description: "Riprova tra qualche istante." });
      return false;
    }
    const r = await sendInvitationEmail({ to: data.email, clientName: data.name, coachName });
    if (r.ok) {
      toast.success(`Invito inviato a ${data.email.trim()}.`);
    } else {
      toast.warning("Invito creato", {
        description: `L'invito è registrato, ma l'email non è partita. Avvisa ${data.email} manualmente o riprova.`,
      });
    }
    load();
    return true;
  }

  async function resendInvite(inv: PendingInvitation) {
    const r = await sendInvitationEmail({ to: inv.email, clientName: inv.full_name, coachName });
    if (r.ok) toast.success(`Invito inviato di nuovo a ${inv.email}.`);
    else toast.error("Invio non riuscito", { description: "Riprova tra qualche istante." });
  }

  async function cancelInvite(inv: PendingInvitation) {
    const name = inv.full_name?.trim() || inv.email;
    try {
      await cancelInvitation(supabaseClientActionsStore, inv.id);
    } catch (e) {
      console.error("invite cancel failed", e);
      toast.error(e instanceof ActionConflictError ? e.message : "Impossibile annullare l'invito.");
      load();
      return;
    }
    load();
    toastWithUndo(`Invito a ${name} annullato.`, () => {
      void restoreInvitation(supabaseClientActionsStore, inv.id)
        .then(() => toast.success(`Invito a ${name} ripristinato.`))
        .catch((e: { code?: string; message?: string }) =>
          toast.error(e instanceof ActionConflictError ? e.message : invitationWriteError(e)),
        )
        .finally(() => load());
    });
  }

  function refreshClients() {
    // La ricerca clienti dell'header legge questa cache ed esclude gli archiviati.
    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
    load();
  }

  async function toggleArchive(row: ClientRow) {
    const c = row.client;
    const name = c.full_name ?? c.email ?? "Cliente";
    const archive = c.status !== "archived";
    const to = archive ? "archived" : "active";
    let before: string;
    try {
      before = await setArchived(supabaseClientActionsStore, c, archive);
    } catch (e) {
      console.error("client status update failed", e);
      toast.error(e instanceof ActionConflictError ? e.message : "Operazione non riuscita.");
      refreshClients();
      return;
    }
    refreshClients();
    toastWithUndo(archive ? `${name} archiviato.` : `${name} ripristinato.`, () => {
      void undoArchive(supabaseClientActionsStore, c, to, before)
        .catch((e: unknown) =>
          toast.error(e instanceof ActionConflictError ? e.message : "Operazione non riuscita."),
        )
        .finally(refreshClients);
    });
  }

  async function deleteClient(id: string, name: string) {
    const { data: res, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { client_id: id },
    });
    const errMsg = (res as { error?: string } | null)?.error;
    if (error || errMsg) {
      // supabase.functions.invoke buries the real server message in
      // err.context (a Response). parseEdgeError extracts the actual
      // text the Edge Function emitted via jsonResponse({error}).
      const detailed = errMsg ?? (error ? await parseEdgeError(error) : "Errore sconosciuto");
      toast.error("Eliminazione non riuscita", { description: detailed });
      return;
    }
    toast.success(`${name} eliminato definitivamente.`);
    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(user?.id) });
    load();
  }

  // Creazione: le scritture di sempre, ora in client-create.ts.
  async function createClient(payload: NewClientPayload): Promise<CreateClientResult> {
    if (!user) return { ok: false, error: "Sessione scaduta." };
    const r = await writeNewClient(supabaseClientCreateStore, user.id, payload);
    if (!r.ok) {
      toast.error("Creazione cliente non riuscita", { description: r.error });
      return r;
    }
    if (r.assignError) {
      toast.warning("Cliente creato, ma assegnazione iniziale non riuscita", {
        description: r.assignError,
      });
    }
    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(user?.id) });
    load();
    return r;
  }

  // Telefono: il dialog di prima, con le credenziali nel dialog a parte.
  const [credentials, setCredentials] = useState<{
    firstName: string;
    email: string;
    password: string;
  } | null>(null);

  async function createClientAccount(data: CreateClientPayload) {
    const r = await createClient({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      password: data.password,
      pathType: data.pathType,
      totalBlocks: data.totalBlocks,
      packLabel: data.packLabel,
      autoRenew: data.autoRenew,
      rules: data.rules,
      freeCredits:
        data.pathType === "free" && data.freeEventTypeId
          ? [{ eventTypeId: data.freeEventTypeId, quantity: data.freeSessions ?? 0 }]
          : [],
    });
    if (!r.ok) return;
    setCreateOpen(false);
    setCredentials({ firstName: data.firstName, email: r.email, password: data.password });
  }

  const tabs: Array<{ key: "all" | ClientStatus; label: string; count: number }> = [
    { key: "all", label: "Tutti", count: counts.all - counts.archived },
    { key: "active", label: "Attivi", count: counts.active },
    { key: "expiring", label: "In scadenza", count: counts.expiring },
    { key: "archived", label: "Archiviati", count: counts.archived },
  ];

  return (
    <>
      {/* ============================================================
          MOBILE LAYOUT (block md:hidden) — replicates
          i_tuoi_atleti_elenco_clienti.html. Reuses visibleCards from
          the existing filter pipeline so search/tabs/sort behavior
          stays identical to desktop.
          ============================================================ */}
      <div className="block md:hidden bg-background min-h-screen">
        {/* sticky e non fixed (passata 10 del lato cliente): dentro .page-enter,
            che dopo l'animazione tiene un transform, un fixed scorreva via col
            contenuto. Nel flusso, il margine che lo compensava non serve più. */}
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-outline-variant/30 flex justify-between items-center h-16 px-4">
          {/* Menu button is decorative on mobile for now — sidebar is
              desktop-only, navigation lives in the bottom nav. */}
          <span className="w-10 h-10" aria-hidden />
          <h1 className="text-xl font-semibold text-primary text-center absolute left-1/2 -translate-x-1/2">
            Clienti
          </h1>
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Aggiungi cliente"
            className="bg-primary-container text-on-primary rounded-full w-10 h-10 p-0 flex items-center justify-center"
          >
            <Plus className="size-5" />
          </Button>
        </header>

        <main className="pt-4 pb-24 px-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
          {/* Pill search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-outline" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca cliente…"
              className="w-full bg-surface-container-lowest border border-outline-variant rounded-full py-3 pl-12 pr-4 text-on-surface focus-visible:ring-2 focus-visible:ring-primary/20"
            />
          </div>

          {/* Tabs as scrollable pills */}
          <ClientStatusTabs
            tabs={tabs}
            activeKey={activeTab}
            onSelect={setActiveTab}
            variant="compact"
            keyPrefix="m-"
          />

          {/* Client cards — AuraCardSkeletons during first load, with
              circular avatar + name + pill chip placeholders that match
              the resolved layout 1:1 so there's no visual jump. */}
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <AuraCardSkeleton key={i} className="p-4 flex items-center gap-4 h-24">
                  <AuraAvatarSkeleton size="lg" />
                  <div className="flex-1 flex flex-col gap-2">
                    <AuraLineSkeleton className="w-2/3 h-5" />
                    <AuraPillSkeleton size="w-28 h-5" />
                  </div>
                  <AuraPillSkeleton size="w-24 h-9" />
                </AuraCardSkeleton>
              ))}
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-[32px] border border-outline-variant/20 p-8 text-center shadow-[0_12px_32px_rgba(0,0,0,0.04)]">
              {clients.length === 0 ? (
                <div className="space-y-3">
                  <UserPlus className="size-9 mx-auto text-outline-variant" />
                  <p className="text-on-surface-variant font-semibold">
                    Nessun cliente ancora. Aggiungi il primo per iniziare.
                  </p>
                  <Button
                    onClick={() => setCreateOpen(true)}
                    className="rounded-full bg-primary text-on-primary"
                  >
                    <UserPlus className="size-4" /> Aggiungi cliente
                  </Button>
                </div>
              ) : (
                <p className="text-outline">Nessun cliente in questa categoria.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleCards.map((d) => {
                const c = d.client;
                const pathLabel = c.pack_label
                  ? c.pack_label
                  : c.path_type === "recurring"
                    ? "Abbonamento Mensile"
                    : c.path_type === "free"
                      ? "Cliente Libero"
                      : "Percorso Fisso";
                return (
                  <Link
                    key={`m-${c.id}`}
                    to="/trainer/clients/$id"
                    params={{ id: c.id }}
                    className="bg-surface-container-lowest rounded-[28px] border border-outline-variant/20 p-4 shadow-[0_8px_24px_rgba(0,0,0,0.04)] flex items-center gap-4 active:scale-[0.99] transition-transform"
                  >
                    <div className="w-14 h-14 rounded-full bg-surface-variant flex-shrink-0 flex items-center justify-center text-base font-bold text-on-surface-variant">
                      {initials(c.full_name, c.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-semibold text-on-surface truncate">
                        {c.full_name ?? "Senza nome"}
                      </h2>
                      <p className="text-xs text-outline truncate">{c.email ?? "—"}</p>
                      <span className="mt-1 inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary-container/10 text-primary-container">
                        {pathLabel}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </main>

        {/* Mobile shares the same Dialog instances with the desktop
            layout below. Hidden DialogTrigger means programmatic
            createOpen toggle from the "+" button + empty-state button
            opens the same multi-step CreateClientDialog. */}
      </div>

      {/* Telefono: «+» apre il dialog di creazione di prima; le credenziali
          arrivano nel dialog a parte. */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <CreateClientDialog open={createOpen} onSubmit={createClientAccount} />
      </Dialog>
      <CredentialsDialog creds={credentials} onClose={() => setCredentials(null)} />

      {/* ============================================================
          DESKTOP LAYOUT (hidden md:block) — passata 05.
          ============================================================ */}
      <div className="hidden md:block">
        <ClientsDesktop
          loading={loading}
          rows={rows}
          invitations={pending}
          eventTypes={eventTypesQ.data ?? []}
          onResendInvite={(i) => void resendInvite(i)}
          onCancelInvite={(i) => void cancelInvite(i)}
          onInvite={inviteClient}
          onCreate={createClient}
          onToggleArchive={(r) => void toggleArchive(r)}
          onDelete={(r) =>
            deleteClient(r.client.id, r.client.full_name ?? r.client.email ?? "Cliente")
          }
        />
      </div>
    </>
  );
}
