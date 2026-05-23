import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  Plus,
  Search,
  Loader2,
  Mail,
  X,
  Archive,
  UserPlus,
  Copy,
  Check,
  Trash2,
  MoreVertical,
  MessageCircle,
  ArchiveRestore,
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

export const Route = createFileRoute("/trainer/clients/")({
  component: ClientsPage,
});

interface ClientRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  path_type: "fixed" | "recurring";
  next_billing_date: string | null;
  pack_label: string | null;
  auto_renew: boolean;
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

function initials(name: string | null, email: string | null): string {
  const src = (name && name.trim()) || (email ?? "?");
  return (
    src
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
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

  async function load() {
    setLoading(true);
    let cq = supabase
      .from("profiles")
      .select(
        "id, full_name, email, phone, status, path_type, next_billing_date, pack_label, auto_renew",
      )
      .is("deleted_at", null);
    if (!isAdmin && user) cq = cq.eq("coach_id", user.id);
    const { data: cs } = await cq;
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
      setBookings((bks as unknown as BookingLite[]) ?? []);
    } else {
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
    setForecasts(fmap);

    setLoading(false);
  }


  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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

      // ----- Current block selection -----
      // Counter aggregation must reflect the block that's "live today",
      // not the lifetime sum of every block ever assigned. See
      // findCurrentBlock for the grace-aware selection.
      const currentBlock = findCurrentBlock(cb, today);
      const currentBlockId = currentBlock?.id ?? null;
      const cAllocs = currentBlockId
        ? cAllocsAll.filter((a) => a.block_id === currentBlockId)
        : [];

      // Residuals from any "previous" block still in grace overlap with
      // today. These are about-to-expire credits the coach should see
      // surfaced — shown as a secondary badge on the card.
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
              previousBlockResiduals += Math.max(
                0,
                a.quantity_assigned - a.quantity_booked,
              );
            }
          }
        }
      }

      // Aggregate by event type (fallback session_type) — only the
      // current block's allocations contribute to the visible counter.
      type Agg = { type: string; used: number; total: number };
      const aggMap = new Map<string, Agg>();
      const keyOf = (etId: string | null, st: string) => etId ?? `st:${st}`;

      for (const a of cAllocs) {
        const k = keyOf(a.event_type_id, a.session_type);
        const name =
          (a.event_type_id && eventTypeById.get(a.event_type_id)) ||
          sessionLabel(a.session_type as SessionType);
        const cur = aggMap.get(k) ?? { type: name, used: 0, total: 0 };
        cur.total += a.quantity_assigned;
        aggMap.set(k, cur);
      }

      // Live used from bookings — only those tied to the current block.
      for (const bk of cBookings) {
        if (
          bk.status !== "completed" &&
          bk.status !== "late_cancelled" &&
          bk.status !== "scheduled"
        )
          continue;
        if (currentBlockId && bk.block_id !== currentBlockId) continue;
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
      toast.error("Invito non riuscito", { description: error.message });
      return;
    }
    const coachName = (user.user_metadata?.full_name as string) || user.email || "il tuo Coach";
    await sendInvitationEmail({ to: data.email, clientName: data.name, coachName });
    toast.success("Invito creato", { description: `Email di invito inviata a ${data.email}.` });
    setOpen(false);
    load();
  }

  async function cancelInvite(id: string) {
    const { error } = await supabase
      .from("client_invitations")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("Errore", { description: error.message });
      return;
    }
    toast.success("Invito annullato");
    load();
  }

  async function setClientStatus(id: string, status: "active" | "archived") {
    const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
    if (error) {
      toast.error("Errore", { description: error.message });
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

  async function createClientAccount(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    pathType: "fixed" | "recurring" | "free";
    totalBlocks: number;
    packLabel: string | null;
    autoRenew: boolean;
    rules: Array<{
      eventTypeId: string;
      sessionType: SessionType;
      quantityPerBlock: number;
      startBlock: number;
      endBlock: number;
    }>;
    freeSessions?: number;
    freeEventTypeId?: string;
  }) {
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
        const { error: pErr } = await supabase
          .from("profiles")
          .update({
            path_type: data.pathType,
            auto_renew: data.autoRenew,
            pack_label: data.packLabel,
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
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {tabs.map((t) => {
              const isActive = activeTab === t.key;
              return (
                <button
                  key={`m-${t.key}`}
                  onClick={() => setActiveTab(t.key)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                    isActive
                      ? "bg-primary-fixed text-on-primary-fixed-variant"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {t.label} ({t.count})
                </button>
              );
            })}
          </div>

          {/* Client cards — AuraCardSkeletons during first load, with
              circular avatar + name + pill chip placeholders that match
              the resolved layout 1:1 so there's no visual jump. */}
          {loading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <AuraCardSkeleton
                  key={i}
                  className="p-4 flex items-center gap-4 h-24"
                >
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
                    ? "NC Performance"
                    : "Percorso Fisso";
                // Tertiary accent for non-recurring packs (matches the
                // mockup's "NC Nutrition" orange chip for variety).
                const isAccent = !!c.pack_label;
                return (
                  <article
                    key={`m-${c.id}`}
                    className="bg-surface-container-lowest rounded-[32px] border border-outline-variant/20 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-16 h-16 rounded-full bg-surface-variant overflow-hidden flex-shrink-0 flex items-center justify-center text-lg font-bold text-on-surface-variant">
                        {initials(c.full_name, c.email)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-on-surface truncate">
                          {c.full_name ?? "Senza nome"}
                        </h2>
                        <span
                          className={`mt-1 inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                            isAccent
                              ? "bg-tertiary-container/20 text-tertiary"
                              : "bg-primary-container/10 text-primary-container"
                          }`}
                        >
                          {pathLabel}
                        </span>
                      </div>
                    </div>
                    <Link
                      to="/trainer/clients/$id"
                      params={{ id: c.id }}
                      className="self-end sm:self-auto border border-primary-container text-primary-container hover:bg-primary-container/10 transition-colors rounded-full px-6 py-2 font-semibold text-sm active:scale-95 text-center min-w-[110px]"
                    >
                      Dettagli
                    </Link>
                  </article>
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
      <div className="flex gap-2 mb-8 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                isActive
                  ? "bg-primary-fixed text-on-primary-fixed-variant"
                  : "bg-surface-container text-on-surface-variant hover:bg-surface-variant"
              }`}
            >
              {t.label} ({t.count})
            </button>
          );
        })}
      </div>

      {/* Pending invitations */}
      {pending.length > 0 && (
        <Card className="mb-6 rounded-[32px] border border-white/40 bg-white/60 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <CardHeader>
            <CardTitle className="text-base font-manrope font-semibold flex items-center gap-2">
              <Mail className="size-4" /> Inviti in attesa ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table className="border-separate border-spacing-0 [&_tr]:border-0">
              <TableHeader className="[&_tr]:border-0">
                <TableRow className="border-0 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline">
                    Nome
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline">
                    Email
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline">
                    Telefono
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline">
                    Stato
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline text-right">
                    Azioni
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-outline-variant/10">
                {pending.map((i) => (
                  <TableRow key={i.id} className="border-0 hover:bg-white/40 transition-colors">
                    <TableCell className="font-medium">{i.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{i.email}</TableCell>
                    <TableCell className="text-muted-foreground">{i.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="rounded-full">
                        In attesa
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => cancelInvite(i.id)}
                      >
                        <X className="size-4" /> Annulla
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleCards.map((d) => {
            const c = d.client;
            const isExpiring = d.status === "expiring";
            const isArchived = d.status === "archived";
            const isCompleted = d.status === "completed";
            const phoneDigits = (c.phone ?? "").replace(/\D/g, "");

            // Predictive exhaustion analytics (computed server-side via
            // client_exhaustion_forecast view).
            const fc = forecasts.get(c.id);
            const showForecast =
              !isArchived &&
              !isCompleted &&
              fc &&
              fc.daysLeft !== null &&
              fc.daysLeft <= 14 &&
              fc.daysLeft >= 0;
            const isCritical = !!fc && fc.daysLeft !== null && fc.daysLeft < 7;
            const formattedExhaustion =
              fc?.date
                ? new Intl.DateTimeFormat("it-IT", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }).format(new Date(fc.date + "T00:00:00"))
                : null;
            const reminderText = encodeURIComponent(
              `Ciao ${(c.full_name ?? "").split(" ")[0] || ""}! Sto pianificando le prossime sessioni — vedo che i tuoi crediti stanno per esaurirsi. Vuoi rinnovare?`,
            );


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
                className="bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] hover:shadow-[0px_8px_30px_rgba(0,86,133,0.08)] transition-all flex flex-col"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-avatar-placeholder text-on-avatar-placeholder flex items-center justify-center text-base font-bold">
                      {initials(c.full_name, c.email)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg leading-6 font-bold text-on-surface truncate">
                        {c.full_name ?? "Senza nome"}
                      </h3>
                      <p className="text-sm text-outline truncate">
                        {c.pack_label
                          ? "PT Pack"
                          : c.path_type === "recurring"
                            ? "Abbonamento Mensile"
                            : d.totalBlocks > 0
                              ? `Percorso ${d.totalBlocks} ${d.totalBlocks === 1 ? "Blocco" : "Blocchi"}`
                              : (c.email ?? "—")}
                      </p>
                      {c.pack_label && (
                        <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-aura-primary/10 text-aura-primary">
                          {c.pack_label}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 ml-2 px-3 py-1 rounded-full text-xs font-semibold ${badgeClass}`}
                  >
                    {badgeLabel}
                  </span>
                </div>

                <div className="mb-6 flex-1">
                  {d.summary.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-outline">
                        Riepilogo Sessioni
                      </p>
                      {d.summary.map((row) => {
                        const pct =
                          row.total > 0
                            ? Math.min(100, Math.round((row.used / row.total) * 100))
                            : 0;
                        return (
                          <div key={row.type}>
                            <div className="flex items-baseline justify-between gap-2">
                              <span className="text-xs font-medium text-on-surface-variant truncate">
                                {row.type}
                              </span>
                              <span className="text-sm font-bold text-aura-primary tabular-nums shrink-0">
                                {row.used} / {row.total}
                              </span>
                            </div>
                            <div className="mt-1 w-full h-1 bg-surface-variant rounded-full overflow-hidden">
                              <div
                                className="h-full bg-aura-primary rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {c.path_type === "recurring" && d.daysToBilling !== null && (
                        <p className="text-[11px] text-outline pt-1">
                          {d.daysToBilling >= 0
                            ? `Rinnovo tra ${d.daysToBilling} ${d.daysToBilling === 1 ? "giorno" : "giorni"}`
                            : "Rinnovo scaduto"}
                        </p>
                      )}
                      {d.previousBlockResiduals > 0 && (
                        <p className="text-[11px] text-warning pt-1">
                          +{d.previousBlockResiduals}{" "}
                          {d.previousBlockResiduals === 1 ? "sessione" : "sessioni"} dal blocco
                          precedente (scadenza in pochi giorni)
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-outline italic">Nessun pacchetto assegnato.</p>
                  )}
                </div>

                {showForecast && formattedExhaustion && (
                  <div
                    className={`mb-4 -mt-2 rounded-2xl px-3 py-2.5 flex items-center gap-2.5 ${
                      isCritical
                        ? "bg-error-container/60 text-on-error-container"
                        : "bg-tertiary-container/70 text-on-tertiary-container"
                    }`}
                  >
                    <Sparkles
                      className={`size-4 shrink-0 ${isCritical ? "text-error" : "text-on-tertiary-container"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold leading-tight truncate">
                        Esaurimento crediti previsto il: {formattedExhaustion}
                      </p>
                      {isCritical && (
                        <p className="text-[10px] opacity-80 leading-tight mt-0.5">
                          Meno di 7 giorni · suggerisci un rinnovo
                        </p>
                      )}
                    </div>
                    {isCritical && phoneDigits && (
                      <a
                        href={`https://wa.me/${phoneDigits}?text=${reminderText}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold bg-white/80 text-error hover:bg-white transition-colors"
                      >
                        Promemoria
                      </a>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-surface-variant flex items-center gap-2">

                  <Button
                    asChild
                    className="flex-1 rounded-full bg-aura-primary/10 text-aura-primary hover:bg-aura-primary/20 shadow-none"
                  >
                    <Link to="/trainer/clients/$id" params={{ id: c.id }}>
                      {isExpiring ? "Rinnova" : "Pianifica"}
                    </Link>
                  </Button>

                  {phoneDigits ? (
                    <a
                      href={`https://wa.me/${phoneDigits}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Apri WhatsApp"
                      className="w-10 h-10 flex items-center justify-center rounded-full border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  ) : (
                    <button
                      disabled
                      title="Telefono non disponibile"
                      className="w-10 h-10 flex items-center justify-center rounded-full border border-surface-variant text-outline-variant cursor-not-allowed"
                    >
                      <MessageCircle className="size-4" />
                    </button>
                  )}

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

function ClientCardMenu({
  client,
  isArchived,
  onArchive,
  onRestore,
  onDelete,
}: {
  client: ClientRow;
  isArchived: boolean;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="w-10 h-10 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container transition-colors"
            aria-label="Altre azioni"
          >
            <MoreVertical className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link to="/trainer/clients/$id" params={{ id: client.id }}>
              Modifica dettagli
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isArchived ? (
            <DropdownMenuItem onClick={onRestore}>
              <ArchiveRestore className="size-4" /> Ripristina
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setConfirmArchive(true)}>
              <Archive className="size-4" /> Archivia
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setConfirmDelete(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-4" /> Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiviare questo cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              {client.full_name ?? client.email} verrà archiviato. I dati storici (blocchi,
              prenotazioni) restano conservati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={onArchive}>Archivia</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Eliminare definitivamente {client.full_name ?? client.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa azione è <strong>irreversibile</strong>. Verranno eliminati account, profilo,
              prenotazioni, blocchi e allocazioni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InviteClientDialog({
  onSubmit,
}: {
  onSubmit: (d: { name: string; email: string; phone: string }) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invita un nuovo cliente</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, email, phone });
        }}
      >
        <div className="space-y-2">
          <Label>Nome completo</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <p className="text-xs text-muted-foreground">
            Il cliente potrà registrarsi con questa email e verrà collegato automaticamente a te.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Telefono</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="submit">Invia invito</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function generateSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const out = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 6; i++) out.push(pick(all));
  return out.sort(() => Math.random() - 0.5).join("");
}

interface RuleDraft {
  id: string;
  eventTypeId: string;
  quantityPerBlock: number;
  startBlock: number;
  endBlock: number;
}

interface CreateClientPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  pathType: "fixed" | "recurring" | "free";
  totalBlocks: number;
  packLabel: string | null;
  autoRenew: boolean;
  rules: Array<{
    eventTypeId: string;
    sessionType: SessionType;
    quantityPerBlock: number;
    startBlock: number;
    endBlock: number;
  }>;
  freeSessions?: number;
  freeEventTypeId?: string;
}

const DURATION_PRESETS: Array<{ value: string; label: string; months: number | null }> = [
  { value: "1", label: "1 Mese", months: 1 },
  { value: "3", label: "3 Mesi", months: 3 },
  { value: "6", label: "6 Mesi", months: 6 },
  { value: "12", label: "12 Mesi", months: 12 },
  { value: "custom", label: "Manuale (numero blocchi)", months: null },
];

function CreateClientDialog({
  open,
  onSubmit,
}: {
  open: boolean;
  onSubmit: (d: CreateClientPayload) => Promise<void>;
}) {
  const { user } = useAuth();
  const eventTypesQ = useCoachEventTypes(user?.id);
  const eventTypes = eventTypesQ.data ?? [];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pathType, setPathType] = useState<"fixed" | "recurring" | "free">("fixed");
  const [durationPreset, setDurationPreset] = useState<string>("3");
  const [customMonths, setCustomMonths] = useState<number>(3);
  const [packLabel, setPackLabel] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [freeSessions, setFreeSessions] = useState<number>(1);
  const [freeEventTypeId, setFreeEventTypeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the entire multi-step flow when the dialog transitions from
  // open → closed. The component stays mounted across opens (Radix gates
  // only the portaled DOM, not the React subtree), so without this the
  // next "Aggiungi Cliente" click would land on step 3 with the previous
  // values still typed in. Gated on a transition ref so we don't reset
  // on every render while the dialog is closed (which would also wipe
  // any in-progress typing from quirky external state callers).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      setStep(1);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPathType("fixed");
      setDurationPreset("3");
      setCustomMonths(3);
      setPackLabel(null);
      setRules([]);
      setFreeSessions(1);
      setFreeEventTypeId("");
      setSubmitting(false);
    }
    wasOpenRef.current = open;
  }, [open]);

  const totalBlocks =
    pathType === "recurring"
      ? 1
      : durationPreset === "custom"
        ? Math.max(1, customMonths)
        : (DURATION_PRESETS.find((d) => d.value === durationPreset)?.months ?? 1);

  function applyPtPackPreset() {
    setPathType("fixed");
    setDurationPreset("custom");
    setCustomMonths(1);
    setPackLabel("Pacchetto 3 sessioni");
    const firstEt = eventTypes.find((e) => e.base_type === "PT Session") ?? eventTypes[0];
    setRules([
      {
        id: crypto.randomUUID(),
        eventTypeId: firstEt?.id ?? "",
        quantityPerBlock: 3,
        startBlock: 1,
        endBlock: 1,
      },
    ]);
    toast.success("Preset PT Pack applicato (3 sessioni, no rinnovo)");
  }

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        eventTypeId: eventTypes[0]?.id ?? "",
        quantityPerBlock: 4,
        startBlock: 1,
        endBlock: totalBlocks,
      },
    ]);
  }

  function updateRule(id: string, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  function canProceedFrom1() {
    return firstName.trim() && lastName.trim() && /\S+@\S+\.\S+/.test(email);
  }

  async function handleFinalSubmit() {
    if (pathType === "free") {
      if (!freeEventTypeId) {
        toast.error("Seleziona un Event Type per le sessioni omaggio.");
        return;
      }
      if (freeSessions < 0) {
        toast.error("Il numero di sessioni omaggio non può essere negativo.");
        return;
      }
    } else {
      if (rules.length === 0) {
        toast.error("Aggiungi almeno una regola di assegnazione.");
        return;
      }
      for (const r of rules) {
        if (!r.eventTypeId) {
          toast.error("Seleziona un Event Type per ogni regola.");
          return;
        }
        if (r.quantityPerBlock < 1) {
          toast.error("La quantità per blocco deve essere ≥ 1.");
          return;
        }
        if (r.startBlock < 1 || r.endBlock < r.startBlock || r.endBlock > totalBlocks) {
          toast.error(`Intervalli blocco non validi (1–${totalBlocks}).`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const expandedRules =
        pathType === "free"
          ? []
          : rules.map((r) => {
              const et = eventTypes.find((e) => e.id === r.eventTypeId)!;
              return {
                eventTypeId: r.eventTypeId,
                sessionType: et.base_type as SessionType,
                quantityPerBlock: r.quantityPerBlock,
                startBlock: r.startBlock,
                endBlock: r.endBlock,
              };
            });
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        password: generateSecurePassword(),
        pathType,
        totalBlocks: pathType === "free" ? 0 : totalBlocks,
        packLabel: pathType === "free" ? "Cliente Libero" : packLabel,
        autoRenew: pathType === "recurring",
        rules: expandedRules,
        freeSessions: pathType === "free" ? freeSessions : undefined,
        freeEventTypeId: pathType === "free" ? freeEventTypeId : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Aggiungi Cliente — Step {step} di 3</DialogTitle>
      </DialogHeader>

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-client-first-name">
                Nome <span className="text-error">*</span>
              </Label>
              <Input
                id="new-client-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-client-last-name">
                Cognome <span className="text-error">*</span>
              </Label>
              <Input
                id="new-client-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                aria-required="true"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-client-email">
              Email <span className="text-error">*</span>
            </Label>
            <Input
              id="new-client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-required="true"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Verrà generata automaticamente una password sicura. Potrai copiarla al termine.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo di Percorso</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPathType("fixed");
                  setPackLabel(null);
                }}
                className={`text-left rounded-[24px] border-2 p-3 backdrop-blur-xl transition-colors ${
                  pathType === "fixed"
                    ? "border-primary bg-primary/10 shadow-[0_8px_30px_rgba(0,62,98,0.08)]"
                    : "border-white/40 bg-white/40 hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Percorso Fisso (Pacchetto)</div>
                <div className="text-xs text-muted-foreground">
                  Durata predefinita o numero blocchi manuale.
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPathType("recurring");
                  setPackLabel(null);
                }}
                className={`text-left rounded-[24px] border-2 p-3 backdrop-blur-xl transition-colors ${
                  pathType === "recurring"
                    ? "border-primary bg-primary/10 shadow-[0_8px_30px_rgba(0,62,98,0.08)]"
                    : "border-white/40 bg-white/40 hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Abbonamento Mensile</div>
                <div className="text-xs text-muted-foreground">
                  Ricorrente: nuovo blocco ogni 30 giorni.
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPathType("free");
                  setPackLabel(null);
                  if (!freeEventTypeId) {
                    const pt =
                      eventTypes.find((e) => e.base_type === "PT Session") ?? eventTypes[0];
                    if (pt) setFreeEventTypeId(pt.id);
                  }
                }}
                className={`text-left rounded-[24px] border-2 p-3 backdrop-blur-xl transition-colors ${
                  pathType === "free"
                    ? "border-primary bg-primary/10 shadow-[0_8px_30px_rgba(0,62,98,0.08)]"
                    : "border-white/40 bg-white/40 hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Cliente Libero (Senza Percorso)</div>
                <div className="text-xs text-muted-foreground">
                  Nessun blocco. Solo sessioni omaggio iniziali.
                </div>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={applyPtPackPreset}>
              <Sparkles className="size-4" /> PT Pack (3 sessioni)
            </Button>
            {packLabel && (
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                {packLabel}
              </span>
            )}
          </div>

          {pathType === "fixed" && (
            <>
              <div className="space-y-2">
                <Label>Durata Percorso</Label>
                <Select value={durationPreset} onValueChange={setDurationPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_PRESETS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {durationPreset === "custom" && (
                <div className="space-y-2">
                  <Label>Numero di Blocchi</Label>
                  <Input
                    type="number"
                    min={1}
                    max={36}
                    value={customMonths}
                    onChange={(e) => setCustomMonths(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Il percorso sarà suddiviso in <strong>{totalBlocks}</strong> blocchi sequenziali
                (~30 giorni ciascuno). Nessun rinnovo automatico.
              </p>
            </>
          )}

          {pathType === "recurring" && (
            <p className="text-xs text-muted-foreground">
              Verrà creato <strong>1 blocco mensile</strong> con rinnovo automatico ogni 30 giorni.
              Le sessioni si resettano ad ogni rinnovo.
            </p>
          )}

          {pathType === "free" && (
            <p className="text-xs text-muted-foreground">
              Nessun blocco verrà creato. Potrai assegnare sessioni omaggio iniziali nel prossimo
              step e in qualsiasi momento dalla scheda cliente.
            </p>
          )}
        </div>
      )}

      {step === 3 && pathType === "free" && (
        <div className="space-y-4">
          <div className="rounded-[24px] bg-white/40 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-sm text-on-surface">Sessioni Omaggio iniziali</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Verranno accreditate al cliente come crediti extra (validità 1 anno).
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tipo di sessione</Label>
              <Select value={freeEventTypeId} onValueChange={setFreeEventTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona event type" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      {et.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Numero di sessioni omaggio</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={freeSessions}
                onChange={(e) => setFreeSessions(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
        </div>
      )}

      {step === 3 && pathType !== "free" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Definisci come distribuire le sessioni sui {totalBlocks} blocchi.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={addRule}
              disabled={eventTypes.length === 0}
            >
              <Plus className="size-4" /> Aggiungi Regola
            </Button>
          </div>

          {eventTypes.length === 0 && (
            <p className="text-xs text-destructive">Crea prima almeno un Event Type.</p>
          )}

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {rules.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nessuna regola. Clicca "Aggiungi Regola" per iniziare.
              </div>
            ) : (
              rules.map((r) => (
                <div key={r.id} className="rounded-2xl border p-3 space-y-3">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-5 space-y-1">
                      <Label className="text-xs">Event Type</Label>
                      <Select
                        value={r.eventTypeId}
                        onValueChange={(v) => updateRule(r.id, { eventTypeId: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona" />
                        </SelectTrigger>
                        <SelectContent>
                          {eventTypes.map((et) => (
                            <SelectItem key={et.id} value={et.id}>
                              {et.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-4 sm:col-span-2 space-y-1">
                      <Label className="text-xs">Q.tà / blocco</Label>
                      <Input
                        type="number"
                        min={1}
                        value={r.quantityPerBlock}
                        onChange={(e) =>
                          updateRule(r.id, {
                            quantityPerBlock: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-4 sm:col-span-2 space-y-1">
                      <Label className="text-xs">Dal blocco</Label>
                      <Input
                        type="number"
                        min={1}
                        max={totalBlocks}
                        value={r.startBlock}
                        onChange={(e) =>
                          updateRule(r.id, { startBlock: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                    </div>
                    <div className="col-span-3 sm:col-span-2 space-y-1">
                      <Label className="text-xs">Al blocco</Label>
                      <Input
                        type="number"
                        min={1}
                        max={totalBlocks}
                        value={r.endBlock}
                        onChange={(e) =>
                          updateRule(r.id, { endBlock: Math.max(1, Number(e.target.value) || 1) })
                        }
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeRule(r.id)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-2">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
            disabled={submitting}
          >
            Indietro
          </Button>
        )}
        {step < 3 && (
          <Button
            type="button"
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
            disabled={step === 1 ? !canProceedFrom1() : false}
          >
            Avanti
          </Button>
        )}
        {step === 3 && (
          <Button
            type="button"
            onClick={handleFinalSubmit}
            disabled={submitting || eventTypes.length === 0}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Crea cliente
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: { firstName: string; email: string; password: string } | null;
  onClose: () => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const message = creds
    ? `Ciao ${creds.firstName}, la tua area personale su NC Calendar è pronta! Puoi accedere da qui: ${appUrl}. Email: ${creds.email} | Password temporanea: ${creds.password}. Ricordati di cambiarla al tuo primo accesso.`
    : "";

  async function copy(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success("Copiato negli appunti");
      setTimeout(() => setCopiedField((c) => (c === field ? null : c)), 1500);
    } catch {
      toast.error("Impossibile copiare");
    }
  }

  return (
    <Dialog
      open={!!creds}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Credenziali Generate</DialogTitle>
        </DialogHeader>
        {creds && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Salva o invia queste credenziali al cliente. Non saranno più visibili dopo la
              chiusura.
            </p>
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Email</Label>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <code className="text-sm font-mono break-all">{creds.email}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(creds.email, "email")}>
                    {copiedField === "email" ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
              <Separator />
              <div>
                <Label className="text-xs uppercase text-muted-foreground">
                  Password Temporanea
                </Label>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <code className="text-sm font-mono break-all">{creds.password}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(creds.password, "password")}
                  >
                    {copiedField === "password" ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={onClose}>
                Chiudi
              </Button>
              <Button onClick={() => copy(message, "message")}>
                {copiedField === "message" ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                Copia Messaggio
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
