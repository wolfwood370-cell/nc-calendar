import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Loader2,
  Mail,
  X,
  UserPlus,
  Copy,
  Check,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { sendInvitationEmail } from "@/lib/email";
import { useCoachEventTypes } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { parseEdgeError } from "@/lib/edge-function-error";
import { errorMessage } from "@/lib/utils";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AuraCardSkeleton,
  AuraAvatarSkeleton,
  AuraLineSkeleton,
  AuraPillSkeleton,
} from "@/components/ui/aura-skeleton";
import { useQueryClient } from "@tanstack/react-query";
import {
  CreateClientDialog,
  type CreateClientPayload,
} from "@/components/create-client-dialog";
import { InviteClientDialog } from "@/components/invite-client-dialog";
import { CredentialsDialog } from "@/components/credentials-dialog";
import { ClientCardMenu } from "@/components/client-card-menu";
import { ClientStatusTabs } from "@/components/client-status-tabs";
import { PendingInvitationsCard } from "@/components/pending-invitations-card";
import { initials } from "@/lib/initials";

export const Route = createFileRoute("/trainer/clients/")({
  component: ClientsPage,
});

interface ClientRow {
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
  // Added by migration 20260524110000_block_auto_renew.sql. Defaults
  // applied server-side, so legacy rows are guaranteed non-null at
  // read time.
  grace_days: number;
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

type ClientStatus = "active" | "expiring" | "archived" | "completed";

interface SessionSummaryRow {
  type: string;
  used: number;
  total: number;
}

interface ClientCardData {
  client: ClientRow;
  status: ClientStatus;
  totalBlocks: number;
  summary: SessionSummaryRow[];
  totalUsed: number;
  totalQty: number;
  daysToBilling: number | null;
  // Residuals from the previous block during the 7-day grace overlap.
  // 0 when no grace overlap is active. Shown as a secondary badge so
  // the coach knows the cliente has soon-expiring credits.
  previousBlockResiduals: number;
}

// Pick the "current" block for the given client: the most recent
// non-deleted block whose [start_date, end_date + grace_days] window
// contains today. Falls back to the latest block if none match (e.g.
// brand-new cliente with future-dated blocks, or beyond-grace cliente
// pending auto-renew via ensure_client_block_state).
function findCurrentBlock(blocks: BlockLite[], today: Date): BlockLite | null {
  if (blocks.length === 0) return null;
  const todayMs = today.getTime();
  // Sort by sequence_order descending so the most recent eligible wins
  // first (covers the 7-day overlap: blocco 2 fresh + blocco 1 in grace
  // → blocco 2 is "current").
  const sorted = [...blocks].sort((a, b) => b.sequence_order - a.sequence_order);
  for (const b of sorted) {
    const start = new Date(b.start_date + "T00:00:00").getTime();
    const end = new Date(b.end_date + "T23:59:59").getTime();
    const graceEndMs = end + (b.grace_days ?? 7) * 86400000;
    if (todayMs >= start && todayMs <= graceEndMs) return b;
  }
  // No block contains today → return the latest as best-effort fallback.
  // The detail page will call ensure_client_block_state to recover the
  // true state and create the next block if auto-renew is on.
  return sorted[0] ?? null;
}

function ClientsPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [blocks, setBlocks] = useState<BlockLite[]>([]);
  const [allocs, setAllocs] = useState<AllocLite[]>([]);
  const [bookings, setBookings] = useState<BookingLite[]>([]);
  // Predictive analytics: rows from the `client_exhaustion_forecast` view.
  // Keyed by client_id for O(1) lookup when rendering the card grid.
  const [forecasts, setForecasts] = useState<
    Map<string, { daysLeft: number | null; date: string | null; weeklyAvg: number }>
  >(new Map());
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | ClientStatus>("all");

  const isAdmin = role === "admin";
  const eventTypesQ = useCoachEventTypes(user?.id);
  const eventTypeById = useMemo(() => {
    const m = new Map<string, string>();
    (eventTypesQ.data ?? []).forEach((e) => m.set(e.id, e.name));
    return m;
  }, [eventTypesQ.data]);

  // HIGH-4 (audit 2026-05-26): `signal` è un piccolo flag mutevole passato
  // dal useEffect chiamante. Se il componente unmount mid-fetch, l'effect
  // cleanup setta signal.cancelled=true e tutti i setState successivi
  // diventano no-op. Senza questo guard, una navigation rapida via questa
  // route produrrebbe il warning React "setState on unmounted component"
  // + potenziale memory leak (closure ancora viva).
  // Default `{ cancelled: false }` per i caller manuali (refresh button,
  // post-mutation reload) dove il rischio unmount è zero.
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
    const clientList = ((cs as ClientRow[]) ?? [])
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

    // Fetch blocks + allocations for status calculation
    const ids = clientList.map((c) => c.id);
    if (ids.length > 0) {
      // grace_days column (added by 20260524110000_block_auto_renew.sql)
      // is not in generated types until Lovable regenerates them. The
      // migration defaults grace_days=7 NOT NULL for every row, so the
      // frontend can safely hardcode the default until types catch up.
      // After Lovable regen, change parsedBlocks below to read b.grace_days.
      let bq = supabase
        .from("training_blocks")
        .select(
          `
          id, client_id, sequence_order, start_date, end_date,
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
      // Supabase typed `.select(...)` returns the joined block_allocations as
      // a discriminated array on each row; the BlockLite/AllocLite shapes
      // below are a structural subset, so we project explicitly instead of
      // forcing `as any[]`.
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
          // Defaults to migration's GRACE_DAYS_DEFAULT (7). Replace with
          // b.grace_days once `grace_days` is in generated Supabase types.
          grace_days: 7,
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
        .in("status", ["scheduled", "completed", "late_cancelled"]);
      if (!isAdmin && user) bookQ = bookQ.eq("coach_id", user.id);
      const { data: bks } = await bookQ;
      if (signal.cancelled) return;
      setBookings((bks as unknown as BookingLite[]) ?? []);
    } else {
      if (signal.cancelled) return;
      setBlocks([]);
      setAllocs([]);
      setBookings([]);
    }

    // Predictive exhaustion forecast — view enforces RLS via the underlying
    // tables, so the coach automatically gets only their own clients.
    type ForecastRow = {
      client_id: string;
      days_until_exhaustion: number | null;
      predicted_exhaustion_date: string | null;
      weekly_avg: number | null;
    };
    const { data: fc } = await (
      supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => Promise<{ data: ForecastRow[] | null }>;
        };
      }
    )
      .from("client_exhaustion_forecast")
      .select("client_id, days_until_exhaustion, predicted_exhaustion_date, weekly_avg");
    const fmap = new Map<
      string,
      { daysLeft: number | null; date: string | null; weeklyAvg: number }
    >();
    for (const r of fc ?? []) {
      fmap.set(r.client_id, {
        daysLeft: r.days_until_exhaustion,
        date: r.predicted_exhaustion_date,
        weeklyAvg: Number(r.weekly_avg ?? 0),
      });
    }
    if (signal.cancelled) return;
    setForecasts(fmap);

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
    // via questa route prima che `load()` finisca (es. unmount mid-fetch
    // perché ha cliccato un Link), il flag `signal.cancelled` viene
    // settato dal cleanup ritornato e i setState successivi diventano
    // no-op. Previene il warning "setState on unmounted component" +
    // memory leak della closure.
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
    // HIGH-5: `load` è una funzione locale dichiarata dentro il componente
    // ma stabile per scopo — chiude su `user`, `isAdmin` (entrambi nei
    // deps) e su setState refs (per definizione stabili in React).
    // Includerla nei deps obbligherebbe a `useCallback` cascade. Pattern
    // accettato dato che il refresh manuale è esposto dal pulsante UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isAdmin]);

  const cardData = useMemo<ClientCardData[]>(() => {
    const blockToClient = new Map<string, string>();
    for (const b of blocks) blockToClient.set(b.id, b.client_id);
    const allocsByClient = new Map<string, AllocLite[]>();
    for (const a of allocs) {
      const cid = blockToClient.get(a.block_id);
      if (!cid) continue;
      const arr = allocsByClient.get(cid) ?? [];
      arr.push(a);
      allocsByClient.set(cid, arr);
    }
    const blocksByClient = new Map<string, BlockLite[]>();
    for (const b of blocks) {
      const arr = blocksByClient.get(b.client_id) ?? [];
      arr.push(b);
      blocksByClient.set(b.client_id, arr);
    }
    const bookingsByClient = new Map<string, BookingLite[]>();
    for (const bk of bookings) {
      if (!bk.client_id) continue;
      const arr = bookingsByClient.get(bk.client_id) ?? [];
      arr.push(bk);
      bookingsByClient.set(bk.client_id, arr);
    }

    const today = new Date();

    return clients.map((c) => {
      const cb = blocksByClient.get(c.id) ?? [];
      const cAllocsAll = allocsByClient.get(c.id) ?? [];
      const cBookings = bookingsByClient.get(c.id) ?? [];

      // ----- Current block (only used for residuals banner + billing) -----
      // The card counter aggregates the WHOLE path (every non-deleted
      // block) so the coach sees lifetime progress vs total assigned —
      // e.g. "4/24 sessions" for a 6-month plan or "8/12" after three
      // monthly renewals. `currentBlock` is still computed for the
      // grace-period residuals banner and the "Rinnovo tra X giorni"
      // line, but no longer narrows the counter itself.
      const currentBlock = findCurrentBlock(cb, today);

      // Residuals from any "previous" block still in grace overlap with
      // today. These are about-to-expire credits the coach should see
      // surfaced — shown as a secondary line on the card.
      let previousBlockResiduals = 0;
      if (currentBlock) {
        const todayMs = today.getTime();
        for (const b of cb) {
          if (b.id === currentBlock.id) continue;
          const end = new Date(b.end_date + "T23:59:59").getTime();
          const graceEnd = end + (b.grace_days ?? 7) * 86400000;
          // Past end_date but still within grace tail → counts as residual.
          if (todayMs > end && todayMs <= graceEnd) {
            for (const a of cAllocsAll) {
              if (a.block_id !== b.id) continue;
              previousBlockResiduals += Math.max(0, a.quantity_assigned - a.quantity_booked);
            }
          }
        }
      }

      // Aggregate by event type (fallback session_type) across ALL
      // non-deleted blocks of this client.
      type Agg = { type: string; used: number; total: number };
      const aggMap = new Map<string, Agg>();
      const keyOf = (etId: string | null, st: string) => etId ?? `st:${st}`;

      for (const a of cAllocsAll) {
        const k = keyOf(a.event_type_id, a.session_type);
        const name =
          (a.event_type_id && eventTypeById.get(a.event_type_id)) ||
          sessionLabel(a.session_type as SessionType);
        const cur = aggMap.get(k) ?? { type: name, used: 0, total: 0 };
        cur.total += a.quantity_assigned;
        aggMap.set(k, cur);
      }

      // Live used from bookings — every completed/scheduled/late_cancelled
      // session across any block of this client contributes to the
      // lifetime counter.
      for (const bk of cBookings) {
        if (
          bk.status !== "completed" &&
          bk.status !== "late_cancelled" &&
          bk.status !== "scheduled"
        )
          continue;
        const k = keyOf(bk.event_type_id ?? null, bk.session_type);
        const cur = aggMap.get(k);
        if (!cur) continue;
        cur.used += 1;
      }

      const summary: SessionSummaryRow[] = [...aggMap.values()]
        .map((r) => ({ ...r, used: Math.min(r.used, r.total) }))
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total);

      const totalUsed = summary.reduce((s, r) => s + r.used, 0);
      const totalQty = summary.reduce((s, r) => s + r.total, 0);

      let daysToBilling: number | null = null;
      if (c.path_type === "recurring" && c.next_billing_date) {
        const nb = new Date(c.next_billing_date + "T00:00:00");
        daysToBilling = Math.ceil((nb.getTime() - today.getTime()) / 86400000);
      }

      let status: ClientStatus;
      if (c.status === "archived") status = "archived";
      else if (totalQty > 0 && totalUsed >= totalQty) status = "completed";
      else if (c.path_type === "recurring") {
        status =
          daysToBilling !== null && daysToBilling <= 5 && daysToBilling >= 0
            ? "expiring"
            : "active";
      } else if (totalQty > 0 && totalQty - totalUsed <= 2) status = "expiring";
      else status = "active";

      return {
        client: c,
        status,
        totalBlocks: cb.length,
        summary,
        totalUsed,
        totalQty,
        daysToBilling,
        previousBlockResiduals,
      };
    });
  }, [clients, blocks, allocs, bookings, eventTypeById]);

  const counts = useMemo(() => {
    const c = { all: cardData.length, active: 0, expiring: 0, archived: 0, completed: 0 };
    for (const d of cardData) c[d.status]++;
    return c;
  }, [cardData]);

  const visibleCards = useMemo(() => {
    const term = q.toLowerCase();
    return cardData.filter((d) => {
      if (activeTab !== "all" && d.status !== activeTab) return false;
      if (activeTab === "all" && d.status === "archived") return false;
      if (!term) return true;
      return (
        (d.client.full_name ?? "").toLowerCase().includes(term) ||
        (d.client.email ?? "").toLowerCase().includes(term)
      );
    });
  }, [cardData, activeTab, q]);

  const pending = invitations.filter((i) => i.status === "pending");

  async function inviteClient(data: { name: string; email: string; phone: string }) {
    if (!user) return;
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
      return;
    }
    const coachName = (user.user_metadata?.full_name as string) || user.email || "il tuo Coach";
    const r = await sendInvitationEmail({ to: data.email, clientName: data.name, coachName });
    if (r.ok) {
      toast.success("Invito creato", { description: `Email di invito inviata a ${data.email}.` });
    } else {
      toast.warning("Invito creato", {
        description: `L'invito è registrato, ma l'email non è partita. Avvisa ${data.email} manualmente o riprova.`,
      });
    }
    setOpen(false);
    load();
  }

  async function cancelInvite(id: string) {
    const { error } = await supabase
      .from("client_invitations")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      console.error("invite cancel failed", error);
      toast.error("Errore", { description: "Impossibile annullare l'invito." });
      return;
    }
    toast.success("Invito annullato");
    load();
  }

  async function setClientStatus(id: string, status: "active" | "archived") {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) {
      console.error("client status update failed", error);
      toast.error("Errore", { description: "Operazione non riuscita." });
      return;
    }
    toast.success(status === "archived" ? "Cliente archiviato" : "Cliente ripristinato");
    load();
  }

  async function deleteClient(id: string, name: string) {
    const { data: res, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { client_id: id },
    });
    const errMsg = (res as { error?: string } | null)?.error;
    if (error || errMsg) {
      // supabase.functions.invoke buries the real server message in
      // err.context (a Response). parseEdgeError extracts the actual
      // text the Edge Function emitted via jsonResponse({error}), so
      // the coach sees "Cliente non trovato" / "Permesso negato" /
      // "function admin_delete_client(uuid) does not exist" instead of
      // the generic "Edge Function returned a non-2xx status code".
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

  const [credentials, setCredentials] = useState<{
    firstName: string;
    email: string;
    password: string;
  } | null>(null);

  async function createClientAccount(data: CreateClientPayload) {
    if (!user) return;
    const { data: res, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: data.email.toLowerCase().trim(),
        password: data.password,
        first_name: data.firstName,
        last_name: data.lastName,
      },
    });
    const errMsg = (res as { error?: string } | null)?.error;
    const newUserId = (res as { user_id?: string } | null)?.user_id;
    if (error || errMsg || !newUserId) {
      toast.error("Creazione cliente non riuscita", { description: errMsg ?? error?.message });
      return;
    }

    try {
      if (data.pathType === "free") {
        // Cliente Libero: nessun blocco/allocazione, solo extra_credits di omaggio
        const qty = Math.max(0, data.freeSessions ?? 0);
        const eventTypeId = data.freeEventTypeId ?? "";
        if (qty > 0 && eventTypeId) {
          const expires = new Date();
          expires.setFullYear(expires.getFullYear() + 1);
          const { error: ecErr } = await supabase.from("extra_credits").insert({
            client_id: newUserId,
            event_type_id: eventTypeId,
            quantity: qty,
            quantity_booked: 0,
            expires_at: expires.toISOString(),
          });
          if (ecErr) throw ecErr;
        }
        const { error: pErr } = await supabase
          .from("profiles")
          .update({
            path_type: "free",
            auto_renew: false,
            auto_renew_blocks: false,
            pack_label: data.packLabel,
            next_billing_date: null,
          })
          .eq("id", newUserId);
        if (pErr) throw pErr;
      } else {
        const today = new Date();
        const blocksToInsert = Array.from({ length: data.totalBlocks }, (_, i) => {
          const start = new Date(today);
          start.setDate(today.getDate() + i * 30);
          const end = new Date(today);
          end.setDate(today.getDate() + (i + 1) * 30 - 1);
          return {
            client_id: newUserId,
            coach_id: user.id,
            start_date: start.toISOString().slice(0, 10),
            end_date: end.toISOString().slice(0, 10),
            status: "active" as const,
            sequence_order: i + 1,
          };
        });
        const { data: blocksRes, error: bErr } = await supabase
          .from("training_blocks")
          .insert(blocksToInsert)
          .select("id, sequence_order, end_date");
        if (bErr) throw bErr;
        const blockBySeq = new Map<number, { id: string; end_date: string }>();
        (blocksRes ?? []).forEach((b) =>
          blockBySeq.set(b.sequence_order as number, {
            id: b.id as string,
            end_date: b.end_date as string,
          }),
        );

        const allocsToInsert: Array<{
          block_id: string;
          week_number: number;
          session_type: SessionType;
          event_type_id: string;
          quantity_assigned: number;
          quantity_booked: number;
          valid_until: string;
        }> = [];
        for (const rule of data.rules) {
          for (let m = rule.startBlock; m <= rule.endBlock; m++) {
            const b = blockBySeq.get(m);
            if (!b) continue;
            allocsToInsert.push({
              block_id: b.id,
              week_number: 1,
              session_type: rule.sessionType,
              event_type_id: rule.eventTypeId,
              quantity_assigned: rule.quantityPerBlock,
              quantity_booked: 0,
              valid_until: b.end_date,
            });
          }
        }
        if (allocsToInsert.length > 0) {
          const { error: aErr } = await supabase.from("block_allocations").insert(allocsToInsert);
          if (aErr) throw aErr;
        }

        // Persist path metadata on profile
        const nextBilling = new Date(today);
        nextBilling.setDate(today.getDate() + 30);
        // path_start_date e' l'ancora che `repair_blocks_alignment` e
        // `ensure_client_block_state` usano per riallineare/seedare i blocchi.
        // Senza, le RPC ritornano `no_anchor` e il cron auto-renew skippa il
        // cliente. Lo settiamo a `today` (= start_date del blocco 1).
        const pathStartIso = today.toISOString().slice(0, 10);
        const { error: pErr } = await supabase
          .from("profiles")
          .update({
            path_type: data.pathType,
            auto_renew: data.autoRenew,
            // auto_renew_blocks is the canonical flag read by
            // ensure_client_block_state / useCurrentBlock; write it
            // in parallel with the legacy `auto_renew` column so
            // recurring clients created today behave correctly.
            auto_renew_blocks: data.autoRenew,
            pack_label: data.packLabel,
            path_start_date: pathStartIso,
            next_billing_date:
              data.pathType === "recurring" ? nextBilling.toISOString().slice(0, 10) : null,
          })
          .eq("id", newUserId);
        if (pErr) throw pErr;
      }
    } catch (e) {
      toast.warning("Cliente creato, ma assegnazione iniziale non riuscita", {
        description: errorMessage(e),
      });
    }

    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(user?.id) });
    // The new client's own client-scoped caches don't exist yet (they haven't
    // logged in), so we don't need to invalidate them here.
    setCreateOpen(false);
    setCredentials({
      firstName: data.firstName,
      email: data.email.toLowerCase().trim(),
      password: data.password,
    });
    load();
  }

  const tabs: Array<{ key: "all" | ClientStatus; label: string; count: number }> = [
    { key: "all", label: "Tutti", count: counts.all - counts.archived },
    { key: "active", label: "Attivi", count: counts.active },
    { key: "expiring", label: "In Scadenza", count: counts.expiring },
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
        <header className="fixed top-0 left-0 right-0 z-40 bg-background/80 backdrop-blur-md border-b border-outline-variant/30 flex justify-between items-center h-16 px-4">
          {/* Menu button is decorative on mobile for now — sidebar is
              desktop-only, navigation lives in the bottom nav. */}
          <span className="w-10 h-10" aria-hidden />
          <h1 className="text-xl font-semibold text-primary text-center absolute left-1/2 -translate-x-1/2">
            I Tuoi Atleti
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

        <main className="pt-20 pb-24 px-4 max-w-3xl mx-auto w-full flex flex-col gap-4">
          {/* Pill search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-outline" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca atleta…"
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
                    <UserPlus className="size-4" /> Aggiungi Cliente
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

      {/* ============================================================
          DESKTOP LAYOUT (hidden md:block) — unchanged below.
          ============================================================ */}
      <div className="hidden md:block -m-6 p-6 md:p-10 bg-surface min-h-[calc(100vh-3.5rem)]">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
          <div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-aura-primary tracking-tight">
              I tuoi Clienti
            </h1>
            <p className="text-sm text-on-surface-variant mt-1">
              Invita nuovi clienti e gestisci il roster.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-full px-6 py-3 h-auto bg-aura-primary hover:bg-primary-container text-white shadow-soft-blue">
                  <UserPlus className="size-4" /> Aggiungi Cliente
                </Button>
              </DialogTrigger>
              {/* Forward `open` so the child can detect the open→closed
                transition and reset its multi-step state. Without this
                the child keeps step=3 + previous form values from one
                open to the next (the React subtree persists between
                opens; Radix only animates the DOM in/out). */}
              <CreateClientDialog open={createOpen} onSubmit={createClientAccount} />
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="rounded-full px-5 py-3 h-auto">
                  <Plus className="size-4" /> Invita
                </Button>
              </DialogTrigger>
              <InviteClientDialog onSubmit={inviteClient} />
            </Dialog>
          </div>
        </div>

        <CredentialsDialog creds={credentials} onClose={() => setCredentials(null)} />

        {/* Search */}
        <div className="mb-6 relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-outline" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca per nome o email…"
            className="pl-12 pr-4 py-3 h-auto bg-surface-container-low border-none rounded-full focus-visible:ring-2 focus-visible:ring-aura-primary focus-visible:bg-white"
          />
        </div>

        {/* Tabs */}
        <ClientStatusTabs tabs={tabs} activeKey={activeTab} onSelect={setActiveTab} />

        {/* Pending invitations */}
        <PendingInvitationsCard invitations={pending} onCancel={cancelInvite} />

        {/* Cards */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] flex flex-col"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <Skeleton className="w-12 h-12 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <div className="mb-6 flex-1 space-y-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
                <div className="pt-4 border-t border-surface-variant flex items-center gap-2">
                  <Skeleton className="h-10 flex-1 rounded-full" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <Skeleton className="h-10 w-10 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleCards.length === 0 ? (
          <div className="bg-white rounded-[32px] p-12 text-center shadow-[0px_4px_20px_rgba(0,86,133,0.05)]">
            {clients.length === 0 ? (
              <div className="space-y-4">
                <UserPlus className="size-10 mx-auto text-outline-variant" />
                <p className="text-on-surface-variant font-semibold">
                  Nessun cliente ancora. Aggiungi il primo per iniziare.
                </p>
                <Button
                  onClick={() => setCreateOpen(true)}
                  className="rounded-full bg-aura-primary hover:bg-primary-container text-white"
                >
                  <UserPlus className="size-4" /> Aggiungi Cliente
                </Button>
              </div>
            ) : (
              <p className="text-outline">Nessun cliente in questa categoria.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visibleCards.map((d) => {
              const c = d.client;
              const isExpiring = d.status === "expiring";
              const isArchived = d.status === "archived";
              const isCompleted = d.status === "completed";

              const pathLabel = c.pack_label
                ? c.pack_label
                : c.path_type === "recurring"
                  ? "Abbonamento Mensile"
                  : c.path_type === "free"
                    ? "Cliente Libero"
                    : "Percorso Fisso";

              const badgeClass = isArchived
                ? "bg-surface-container text-on-surface-variant"
                : isCompleted
                  ? "bg-surface-container text-on-surface-variant"
                  : isExpiring
                    ? "bg-orange-50 text-orange-600"
                    : "bg-emerald-50 text-emerald-600";
              const badgeLabel = isArchived
                ? "Archiviato"
                : isCompleted
                  ? "Completato"
                  : isExpiring
                    ? "In Scadenza"
                    : "Attivo";

              return (
                <div
                  key={c.id}
                  className="relative group bg-white rounded-[28px] p-5 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] hover:shadow-[0px_8px_30px_rgba(0,86,133,0.08)] transition-all"
                >
                  <Link
                    to="/trainer/clients/$id"
                    params={{ id: c.id }}
                    className="flex items-center gap-4 min-w-0"
                  >
                    <div className="w-14 h-14 shrink-0 rounded-full bg-avatar-placeholder text-on-avatar-placeholder flex items-center justify-center text-base font-bold">
                      {initials(c.full_name, c.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base leading-5 font-bold text-on-surface truncate">
                        {c.full_name ?? "Senza nome"}
                      </h3>
                      <p className="text-xs text-outline truncate mt-0.5">
                        {c.email ?? "—"}
                      </p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-aura-primary/10 text-aura-primary">
                          {pathLabel}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${badgeClass}`}
                        >
                          {badgeLabel}
                        </span>
                      </div>
                    </div>
                  </Link>

                  <div className="absolute top-3 right-3">
                    <ClientCardMenu
                      client={c}
                      isArchived={isArchived}
                      onArchive={() => setClientStatus(c.id, "archived")}
                      onRestore={() => setClientStatus(c.id, "active")}
                      onDelete={() => deleteClient(c.id, c.full_name ?? c.email ?? "Cliente")}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

