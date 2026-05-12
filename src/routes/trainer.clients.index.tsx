import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import type { SessionType } from "@/lib/mock-data";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
}
interface AllocLite {
  block_id: string;
  event_type_id: string | null;
  session_type: SessionType;
  quantity_assigned: number;
  quantity_booked: number;
}

type ClientStatus = "active" | "expiring" | "archived";

interface ClientCardData {
  client: ClientRow;
  status: ClientStatus;
  totalBlocks: number;
  activeBlockSeq: number | null;
  completed: number;
  total: number;
  eventTypeLabel: string;
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
      .select("id, full_name, email, phone, status")
      .is("deleted_at", null);
    if (!isAdmin && user) cq = cq.eq("coach_id", user.id);
    const { data: cs } = await cq;
    const clientList = (cs as ClientRow[]) ?? [];
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
      let bq = supabase
        .from("training_blocks")
        .select("id, client_id, sequence_order, start_date")
        .in("client_id", ids)
        .is("deleted_at", null)
        .order("sequence_order", { ascending: true });
      if (!isAdmin && user) bq = bq.eq("coach_id", user.id);
      const { data: bs } = await bq;
      const blockList = (bs as BlockLite[]) ?? [];
      setBlocks(blockList);

      const blockIds = blockList.map((b) => b.id);
      if (blockIds.length > 0) {
        const { data: as } = await supabase
          .from("block_allocations")
          .select("block_id, event_type_id, session_type, quantity_assigned, quantity_booked")
          .in("block_id", blockIds);
        setAllocs((as as AllocLite[]) ?? []);
      } else {
        setAllocs([]);
      }
    } else {
      setBlocks([]);
      setAllocs([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const cardData = useMemo<ClientCardData[]>(() => {
    const allocsByBlock = new Map<string, AllocLite[]>();
    for (const a of allocs) {
      const arr = allocsByBlock.get(a.block_id) ?? [];
      arr.push(a);
      allocsByBlock.set(a.block_id, arr);
    }
    const blocksByClient = new Map<string, BlockLite[]>();
    for (const b of blocks) {
      const arr = blocksByClient.get(b.client_id) ?? [];
      arr.push(b);
      blocksByClient.set(b.client_id, arr);
    }

    return clients.map((c) => {
      const cb = (blocksByClient.get(c.id) ?? [])
        .slice()
        .sort((a, b) => a.sequence_order - b.sequence_order);
      // Find first block with remaining capacity, else most recent
      let activeBlock: BlockLite | null = null;
      for (const b of cb) {
        const al = allocsByBlock.get(b.id) ?? [];
        const remaining = al.reduce(
          (s, x) => s + Math.max(0, x.quantity_assigned - x.quantity_booked),
          0,
        );
        if (remaining > 0) {
          activeBlock = b;
          break;
        }
      }
      if (!activeBlock && cb.length > 0) activeBlock = cb[cb.length - 1];

      const al = activeBlock ? (allocsByBlock.get(activeBlock.id) ?? []) : [];
      const total = al.reduce((s, x) => s + x.quantity_assigned, 0);
      const completed = al.reduce(
        (s, x) => s + Math.min(x.quantity_booked, x.quantity_assigned),
        0,
      );
      const remaining = total - completed;

      const dominant = al.slice().sort((a, b) => b.quantity_assigned - a.quantity_assigned)[0];
      const eventTypeLabel = dominant
        ? dominant.event_type_id
          ? (eventTypeById.get(dominant.event_type_id) ?? "Sessioni")
          : "Sessioni"
        : "Sessioni";

      let status: ClientStatus;
      if (c.status === "archived") status = "archived";
      else if (cb.length === 0) status = "active";
      else if (remaining <= 1) status = "expiring";
      else status = "active";

      return {
        client: c,
        status,
        totalBlocks: cb.length,
        activeBlockSeq: activeBlock?.sequence_order ?? null,
        completed,
        total,
        eventTypeLabel,
      };
    });
  }, [clients, blocks, allocs, eventTypeById]);

  const counts = useMemo(() => {
    const c = { all: cardData.length, active: 0, expiring: 0, archived: 0 };
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
      toast.error("Eliminazione non riuscita", { description: errMsg ?? error?.message });
      return;
    }
    toast.success(`${name} eliminato definitivamente.`);
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["blocks"] });
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
    totalBlocks: number;
    rules: Array<{
      eventTypeId: string;
      sessionType: SessionType;
      quantityPerBlock: number;
      startBlock: number;
      endBlock: number;
    }>;
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
    } catch (e) {
      toast.warning("Cliente creato, ma assegnazione blocchi non riuscita", {
        description: (e as Error).message,
      });
    }

    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["block-allocations"] });
    qc.invalidateQueries({ queryKey: ["blocks"] });
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
    <div className="-m-6 p-6 md:p-10 bg-[#f8f9fe] min-h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-8">
        <div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-[#003e62] tracking-tight">
            I tuoi Clienti
          </h1>
          <p className="text-sm text-[#41474f] mt-1">Invita nuovi clienti e gestisci il roster.</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full px-6 py-3 h-auto bg-[#003e62] hover:bg-[#005685] text-white shadow-[0px_4px_20px_rgba(0,86,133,0.05)]">
                <UserPlus className="size-4" /> Aggiungi Cliente
              </Button>
            </DialogTrigger>
            <CreateClientDialog onSubmit={createClientAccount} />
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
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-[#717880]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per nome o email…"
          className="pl-12 pr-4 py-3 h-auto bg-[#F1F3F9] border-none rounded-full focus-visible:ring-2 focus-visible:ring-[#003e62] focus-visible:bg-white"
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
                  ? "bg-[#cde5ff] text-[#004b74]"
                  : "bg-[#eceef2] text-[#41474f] hover:bg-[#e1e2e7]"
              }`}
            >
              {t.label} ({t.count})
            </button>
          );
        })}
      </div>

      {/* Pending invitations */}
      {pending.length > 0 && (
        <Card className="mb-6 rounded-[24px] border-none shadow-[0px_4px_20px_rgba(0,86,133,0.05)]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4" /> Inviti in attesa ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{i.email}</TableCell>
                    <TableCell className="text-muted-foreground">{i.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">In attesa</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => cancelInvite(i.id)}>
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
              <div className="pt-4 border-t border-[#e1e2e7] flex items-center gap-2">
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
              <UserPlus className="size-10 mx-auto text-[#c1c7d0]" />
              <p className="text-[#41474f] font-semibold">
                Nessun cliente ancora. Aggiungi il primo per iniziare.
              </p>
              <Button
                onClick={() => setCreateOpen(true)}
                className="rounded-full bg-[#003e62] hover:bg-[#005685] text-white"
              >
                <UserPlus className="size-4" /> Aggiungi Cliente
              </Button>
            </div>
          ) : (
            <p className="text-[#717880]">Nessun cliente in questa categoria.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleCards.map((d) => {
            const c = d.client;
            const isExpiring = d.status === "expiring";
            const isArchived = d.status === "archived";
            const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
            const phoneDigits = (c.phone ?? "").replace(/\D/g, "");

            return (
              <div
                key={c.id}
                className="bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] hover:shadow-[0px_8px_30px_rgba(0,86,133,0.08)] transition-all flex flex-col"
              >
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-[#d6e5ec] text-[#3b494f] flex items-center justify-center text-base font-bold">
                      {initials(c.full_name, c.email)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-lg leading-6 font-bold text-[#191c1f] truncate">
                        {c.full_name ?? "Senza nome"}
                      </h3>
                      <p className="text-sm text-[#717880] truncate">
                        {d.totalBlocks > 0
                          ? `Percorso ${d.totalBlocks} ${d.totalBlocks === 1 ? "Blocco" : "Blocchi"}`
                          : (c.email ?? "—")}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 ml-2 px-3 py-1 rounded-full text-xs font-semibold ${
                      isArchived
                        ? "bg-[#eceef2] text-[#41474f]"
                        : isExpiring
                          ? "bg-orange-50 text-orange-600"
                          : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {isArchived ? "Archiviato" : isExpiring ? "In Scadenza" : "Attivo"}
                  </span>
                </div>

                <div className="mb-6 flex-1">
                  {d.activeBlockSeq && d.total > 0 ? (
                    <>
                      <div className="flex justify-between mb-2">
                        <span className="text-xs font-semibold text-[#41474f]">
                          Blocco {d.activeBlockSeq} - {d.completed}/{d.total} {d.eventTypeLabel}{" "}
                          completati
                        </span>
                      </div>
                      <div className="w-full h-2 bg-[#e1e2e7] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#003e62] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[#717880] italic">Nessun percorso attivo.</p>
                  )}
                </div>

                <div className="pt-4 border-t border-[#e1e2e7] flex items-center gap-2">
                  <Button
                    asChild
                    className="flex-1 rounded-full bg-[#003e62]/10 text-[#003e62] hover:bg-[#003e62]/20 shadow-none"
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
                      className="w-10 h-10 flex items-center justify-center rounded-full border border-[#c1c7d0] text-[#41474f] hover:bg-[#eceef2] transition-colors"
                    >
                      <MessageCircle className="size-4" />
                    </a>
                  ) : (
                    <button
                      disabled
                      title="Telefono non disponibile"
                      className="w-10 h-10 flex items-center justify-center rounded-full border border-[#e1e2e7] text-[#c1c7d0] cursor-not-allowed"
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
            className="w-10 h-10 flex items-center justify-center rounded-full text-[#41474f] hover:bg-[#eceef2] transition-colors"
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
  totalBlocks: number;
  rules: Array<{
    eventTypeId: string;
    sessionType: SessionType;
    quantityPerBlock: number;
    startBlock: number;
    endBlock: number;
  }>;
}

const DURATION_PRESETS: Array<{ value: string; label: string; months: number | null }> = [
  { value: "1", label: "1 Mese", months: 1 },
  { value: "3", label: "3 Mesi", months: 3 },
  { value: "6", label: "6 Mesi", months: 6 },
  { value: "12", label: "12 Mesi", months: 12 },
  { value: "custom", label: "Personalizzato", months: null },
];

function CreateClientDialog({ onSubmit }: { onSubmit: (d: CreateClientPayload) => Promise<void> }) {
  const { user } = useAuth();
  const eventTypesQ = useCoachEventTypes(user?.id);
  const eventTypes = eventTypesQ.data ?? [];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [durationPreset, setDurationPreset] = useState<string>("3");
  const [customMonths, setCustomMonths] = useState<number>(3);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const totalBlocks =
    durationPreset === "custom"
      ? Math.max(1, customMonths)
      : (DURATION_PRESETS.find((d) => d.value === durationPreset)?.months ?? 1);

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
    setSubmitting(true);
    try {
      const expandedRules = rules.map((r) => {
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
        totalBlocks,
        rules: expandedRules,
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
              <Label>Nome</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Cognome</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <p className="text-xs text-muted-foreground">
            Verrà generata automaticamente una password sicura. Potrai copiarla al termine.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
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
              <Label>Numero di Blocchi (mesi)</Label>
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
            Il percorso sarà suddiviso in <strong>{totalBlocks}</strong> blocchi mensili sequenziali
            (~30 giorni ciascuno).
          </p>
        </div>
      )}

      {step === 3 && (
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
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nessuna regola. Clicca "Aggiungi Regola" per iniziare.
              </div>
            ) : (
              rules.map((r) => (
                <div key={r.id} className="rounded-md border p-3 space-y-3">
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
