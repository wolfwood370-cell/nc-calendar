import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, CalendarIcon, Loader2, Save, RotateCcw, Sparkles,
  Check, X as XIcon, Plus, Trash2, Unlink, Edit3, CalendarDays,
  Dumbbell, Stethoscope, Ban, CheckCircle2, Clock,
} from "lucide-react";
type EditableStatus = "scheduled" | "completed" | "cancelled" | "late_cancelled";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCoachEventTypes } from "@/lib/queries";
import type { SessionType } from "@/lib/mock-data";
import { toast } from "sonner";
import { format, addDays, startOfDay, isBefore, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

const WEEKS_PER_BLOCK = 4;

export const Route = createFileRoute("/trainer/clients/$id")({
  component: ClientPathPage,
});

interface WeekRow {
  week_number: number;
  block_number: number;
  monday_date: string;
  shifted: boolean;
}

interface BlockRecord {
  id: string;
  sequence_order: number;
}

interface AllocationRecord {
  id: string;
  block_id: string;
  event_type_id: string | null;
  session_type: SessionType;
  quantity_assigned: number;
  quantity_booked: number;
  week_number: number;
  valid_until: string | null;
}

interface OrphanBooking {
  id: string;
  scheduled_at: string;
  title: string | null;
  notes: string | null;
  event_type_id: string | null;
  session_type: SessionType;
}

interface ClientBooking {
  id: string;
  scheduled_at: string;
  title: string | null;
  status: string;
  block_id: string | null;
  event_type_id: string | null;
  session_type: SessionType;
  google_event_id: string | null;
  created_at: string;
}

function toIso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function nextMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 1 ? 0 : (8 - day) % 7 || 7;
  return addDays(startOfDay(d), diff);
}

function isMonday(d: Date) {
  return d.getDay() === 1;
}

function ClientPathPage() {
  const { id: clientId } = useParams({ from: "/trainer/clients/$id" });
  const { user } = useAuth();
  const eventTypesQ = useCoachEventTypes(user?.id);
  const eventTypes = eventTypesQ.data ?? [];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [pathStart, setPathStart] = useState<Date | undefined>(undefined);
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [bookingsByBlock, setBookingsByBlock] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<WeekRow[]>([]);
  const [originalRows, setOriginalRows] = useState<WeekRow[]>([]);
  const [orphans, setOrphans] = useState<OrphanBooking[]>([]);
  const [clientBookings, setClientBookings] = useState<ClientBooking[]>([]);
  const [editingBooking, setEditingBooking] = useState<ClientBooking | null>(null);

  const totalBlocks = blocks.length;
  const totalWeeks = totalBlocks * WEEKS_PER_BLOCK;

  useEffect(() => {
    if (!clientId || !user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, user?.id]);

  async function load() {
    if (!user) return;
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, path_start_date")
      .eq("id", clientId)
      .maybeSingle();
    const fn = profile?.full_name ?? profile?.email ?? "Cliente";
    setClientName(fn);
    const parts = (profile?.full_name ?? "").trim().split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setPathStart(profile?.path_start_date ? parseISO(profile.path_start_date as string) : undefined);

    const { data: bls } = await supabase
      .from("training_blocks")
      .select("id, sequence_order")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("sequence_order", { ascending: true });
    const blockList = (bls ?? []).map((b) => ({
      id: b.id as string,
      sequence_order: b.sequence_order as number,
    }));
    setBlocks(blockList);
    const blockIds = blockList.map((b) => b.id);

    if (blockIds.length > 0) {
      const { data: allocs } = await supabase
        .from("block_allocations")
        .select("id, block_id, event_type_id, session_type, quantity_assigned, quantity_booked, week_number, valid_until")
        .in("block_id", blockIds);
      setAllocations((allocs ?? []) as AllocationRecord[]);

      const { data: bks } = await supabase
        .from("bookings")
        .select("id, block_id, status")
        .in("block_id", blockIds)
        .is("deleted_at", null);
      const counts: Record<string, number> = {};
      (bks ?? []).forEach((b) => {
        const bid = b.block_id as string | null;
        if (!bid) return;
        if (b.status === "scheduled" || b.status === "completed") {
          counts[bid] = (counts[bid] ?? 0) + 1;
        }
      });
      setBookingsByBlock(counts);
    } else {
      setAllocations([]);
      setBookingsByBlock({});
    }

    const { data: existing } = await supabase
      .from("weekly_schedule")
      .select("week_number, block_number, monday_date, shifted")
      .eq("client_id", clientId)
      .order("week_number", { ascending: true });

    const map = new Map<number, WeekRow>();
    (existing ?? []).forEach((r) =>
      map.set(r.week_number as number, {
        week_number: r.week_number as number,
        block_number: r.block_number as number,
        monday_date: r.monday_date as string,
        shifted: r.shifted as boolean,
      }),
    );

    const totalW = blockList.length * WEEKS_PER_BLOCK;
    const start = profile?.path_start_date ? parseISO(profile.path_start_date as string) : undefined;
    const generated: WeekRow[] = [];
    for (let i = 0; i < totalW; i++) {
      const wn = i + 1;
      const block = Math.floor(i / WEEKS_PER_BLOCK) + 1;
      const fallback = start ? toIso(addDays(start, i * 7)) : "";
      const e = map.get(wn);
      generated.push({
        week_number: wn,
        block_number: block,
        monday_date: e?.monday_date ?? fallback,
        shifted: e?.shifted ?? false,
      });
    }
    setRows(generated);
    setOriginalRows(generated.map((r) => ({ ...r })));

    // Carica le sessioni del cliente (linkate)
    const { data: cbs } = await supabase
      .from("bookings")
      .select("id, scheduled_at, title, status, block_id, event_type_id, session_type, google_event_id, created_at")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false });
    const bookingsList = (cbs ?? []) as ClientBooking[];
    setClientBookings(bookingsList);

    // Toast: nuove sessioni auto-assegnate negli ultimi 5 minuti
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentAuto = bookingsList.filter(
      (b) => b.google_event_id && new Date(b.created_at).getTime() > fiveMinAgo,
    ).length;
    if (recentAuto > 0) {
      toast.success(`Ho assegnato automaticamente ${recentAuto} ${recentAuto === 1 ? "nuova sessione" : "nuove sessioni"} a questo cliente.`);
    }

    await loadOrphans(fn);
    setLoading(false);
  }

  async function loadOrphans(fullName: string) {
    if (!user) return;
    const fn = fullName.trim();
    if (!fn) {
      setOrphans([]);
      return;
    }
    const parts = fn.split(/\s+/);
    const first = parts[0] ?? "";
    const last = parts.slice(1).join(" ");
    const { data } = await supabase
      .from("bookings")
      .select("id, scheduled_at, title, notes, event_type_id, session_type, ignored_by_clients")
      .eq("coach_id", user.id)
      .is("client_id", null)
      .is("deleted_at", null);
    const matches = ((data ?? []) as Array<OrphanBooking & { ignored_by_clients: string[] | null }>).filter((b) => {
      const ign = (b.ignored_by_clients ?? []) as string[];
      if (ign.includes(clientId)) return false;
      const hay = `${b.title ?? ""} ${b.notes ?? ""}`.toLowerCase();
      const f = first.toLowerCase();
      const l = last.toLowerCase();
      if (!f) return false;
      if (l) return hay.includes(f) && hay.includes(l);
      return hay.includes(f);
    });
    setOrphans(matches.map((m) => ({
      id: m.id,
      scheduled_at: m.scheduled_at,
      title: m.title,
      notes: m.notes,
      event_type_id: m.event_type_id,
      session_type: m.session_type,
    })));
  }

  async function confirmOrphan(o: OrphanBooking) {
    // Try to attach to first active block with available allocation for that event_type
    let blockId: string | null = null;
    if (o.event_type_id) {
      const sortedBlocks = [...blocks].sort((a, b) => a.sequence_order - b.sequence_order);
      for (const b of sortedBlocks) {
        const candidate = allocations.find(
          (a) => a.block_id === b.id && a.event_type_id === o.event_type_id && a.quantity_booked < a.quantity_assigned,
        );
        if (candidate) {
          blockId = b.id;
          await supabase
            .from("block_allocations")
            .update({ quantity_booked: candidate.quantity_booked + 1 })
            .eq("id", candidate.id);
          break;
        }
      }
    }
    const { error } = await supabase
      .from("bookings")
      .update({ client_id: clientId, block_id: blockId })
      .eq("id", o.id);
    if (error) {
      toast.error("Conferma non riuscita", { description: error.message });
      return;
    }
    toast.success("Sessione associata al cliente");
    void load();
  }

  async function discardOrphan(o: OrphanBooking) {
    const { data: row } = await supabase
      .from("bookings")
      .select("ignored_by_clients")
      .eq("id", o.id)
      .maybeSingle();
    const current = (row?.ignored_by_clients as string[] | null) ?? [];
    if (!current.includes(clientId)) current.push(clientId);
    const { error } = await supabase
      .from("bookings")
      .update({ ignored_by_clients: current })
      .eq("id", o.id);
    if (error) {
      toast.error("Errore", { description: error.message });
      return;
    }
    toast.info("Sessione ignorata per questo cliente");
    setOrphans((prev) => prev.filter((p) => p.id !== o.id));
  }

  async function unlinkBooking(b: ClientBooking, opts: { confirmFirst?: boolean; silent?: boolean } = {}) {
    if (opts.confirmFirst !== false) {
      if (!confirm("Scollegare questa sessione dal profilo? Verrà ignorata dallo Smart Matcher per questo cliente.")) return;
    }
    // Restituisci credito se era contabilizzato
    if (b.block_id) {
      const alloc = allocations.find(
        (a) => a.block_id === b.block_id &&
          (b.event_type_id ? a.event_type_id === b.event_type_id : a.session_type === b.session_type) &&
          a.quantity_booked > 0,
      );
      if (alloc) {
        await supabase
          .from("block_allocations")
          .update({ quantity_booked: Math.max(0, alloc.quantity_booked - 1) })
          .eq("id", alloc.id);
      }
    }
    // Anti-ghosting: aggiungi clientId a ignored_by_clients
    const { data: row } = await supabase
      .from("bookings")
      .select("ignored_by_clients")
      .eq("id", b.id)
      .maybeSingle();
    const ignored = (row?.ignored_by_clients as string[] | null) ?? [];
    if (!ignored.includes(clientId)) ignored.push(clientId);

    const { error } = await supabase
      .from("bookings")
      .update({ client_id: null, block_id: null, ignored_by_clients: ignored })
      .eq("id", b.id);
    if (error) {
      toast.error("Scollegamento non riuscito", { description: error.message });
      return;
    }
    // Rimozione istantanea dalla griglia
    setClientBookings((prev) => prev.filter((x) => x.id !== b.id));
    setEditingBooking(null);
    if (!opts.silent) toast.success("Evento rimosso solo dal profilo");
    void load();
  }

  async function deleteBookingEverywhere(b: ClientBooking) {
    // Sync Google Calendar delete
    if (b.google_event_id && user) {
      try {
        await supabase.functions.invoke("sync-calendar", {
          body: {
            action: "cancel",
            coach_id: user.id,
            google_event_id: b.google_event_id,
          },
        });
      } catch (err) {
        console.error("sync-calendar delete failed", err);
      }
    }
    // Restituisci credito se era contabilizzato
    if (b.block_id) {
      const alloc = allocations.find(
        (a) => a.block_id === b.block_id &&
          (b.event_type_id ? a.event_type_id === b.event_type_id : a.session_type === b.session_type) &&
          a.quantity_booked > 0,
      );
      if (alloc) {
        await supabase
          .from("block_allocations")
          .update({ quantity_booked: Math.max(0, alloc.quantity_booked - 1) })
          .eq("id", alloc.id);
      }
    }
    const { error } = await supabase
      .from("bookings")
      .update({ deleted_at: new Date().toISOString(), status: "cancelled" })
      .eq("id", b.id);
    if (error) {
      toast.error("Eliminazione non riuscita", { description: error.message });
      return;
    }
    setClientBookings((prev) => prev.filter((x) => x.id !== b.id));
    setEditingBooking(null);
    toast.success("Evento eliminato definitivamente");
    void load();
  }

  async function saveBookingEdit(input: {
    id: string;
    scheduled_at: string;
    event_type_id: string | null;
    session_type: SessionType;
    status: EditableStatus;
    block_id: string | null;
    prevStatus: string;
    prevEventTypeId: string | null;
    prevSessionType: SessionType;
  }) {
    const { error } = await supabase
      .from("bookings")
      .update({
        scheduled_at: input.scheduled_at,
        event_type_id: input.event_type_id,
        session_type: input.session_type,
        status: input.status,
      })
      .eq("id", input.id);
    if (error) {
      toast.error("Aggiornamento non riuscito", { description: error.message });
      return;
    }

    // Restore credit if newly cancelled (refunded)
    const wasActive = input.prevStatus === "scheduled" || input.prevStatus === "completed";
    if (input.status === "cancelled" && wasActive && input.block_id) {
      const alloc = allocations.find(
        (a) => a.block_id === input.block_id &&
          (input.prevEventTypeId ? a.event_type_id === input.prevEventTypeId : a.session_type === input.prevSessionType) &&
          a.quantity_booked > 0,
      );
      if (alloc) {
        await supabase
          .from("block_allocations")
          .update({ quantity_booked: Math.max(0, alloc.quantity_booked - 1) })
          .eq("id", alloc.id);
      }
    }

    toast.success("Sessione aggiornata");
    setEditingBooking(null);
    void load();
  }

  function regenerateFromStart(start: Date) {
    const updated = rows.map((r, idx) => ({
      ...r,
      monday_date: toIso(addDays(start, idx * 7)),
      shifted: false,
    }));
    setRows(updated);
  }

  function handleStartChange(d: Date | undefined) {
    if (!d) return;
    if (!isMonday(d)) {
      const m = nextMonday(d);
      toast.info("Data spostata al lunedì successivo", {
        description: format(m, "dd MMM yyyy", { locale: it }),
      });
      setPathStart(m);
      regenerateFromStart(m);
      return;
    }
    setPathStart(d);
    regenerateFromStart(d);
  }

  function handleWeekDateChange(weekIndex: number, newDate: Date) {
    const monday = isMonday(newDate) ? newDate : nextMonday(newDate);
    const updated = [...rows];
    updated[weekIndex] = {
      ...updated[weekIndex],
      monday_date: toIso(monday),
      shifted: true,
    };
    for (let i = weekIndex + 1; i < updated.length; i++) {
      updated[i] = {
        ...updated[i],
        monday_date: toIso(addDays(monday, (i - weekIndex) * 7)),
        shifted: updated[i].shifted,
      };
    }
    setRows(updated);
  }

  function resetSchedule() {
    if (!pathStart) return;
    regenerateFromStart(pathStart);
    toast.success("Calendario ricalcolato dalla data di inizio");
  }

  async function saveSchedule() {
    if (!user) return;
    if (!pathStart) {
      toast.error("Imposta una Data Inizio Percorso prima di salvare");
      return;
    }
    setSaving(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ path_start_date: toIso(pathStart) })
        .eq("id", clientId);
      if (pErr) throw pErr;

      const { error: dErr } = await supabase
        .from("weekly_schedule")
        .delete()
        .eq("client_id", clientId);
      if (dErr) throw dErr;

      if (rows.length > 0) {
        const payload = rows.map((r) => ({
          client_id: clientId,
          coach_id: user.id,
          week_number: r.week_number,
          block_number: r.block_number,
          monday_date: r.monday_date,
          shifted: r.shifted,
        }));
        const { error: iErr } = await supabase.from("weekly_schedule").insert(payload);
        if (iErr) throw iErr;
      }
      setOriginalRows(rows.map((r) => ({ ...r })));
      toast.success("Calendario salvato");
    } catch (e) {
      toast.error("Salvataggio non riuscito", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const dirty = useMemo(() => {
    if (rows.length !== originalRows.length) return true;
    return rows.some((r, i) =>
      r.monday_date !== originalRows[i]?.monday_date ||
      r.shifted !== originalRows[i]?.shifted,
    );
  }, [rows, originalRows]);

  const today = startOfDay(new Date());

  // Map sequence_order -> block aggregate
  const blockAggregates = useMemo(() => {
    return blocks
      .slice()
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((b) => {
        const allocs = allocations.filter((a) => a.block_id === b.id);
        const totalCredits = allocs.reduce((s, a) => s + a.quantity_assigned, 0);
        const completed = bookingsByBlock[b.id] ?? 0;
        const grouped = new Map<string, { name: string; qty: number }>();
        allocs.forEach((a) => {
          const et = eventTypes.find((e) => e.id === a.event_type_id);
          const key = a.event_type_id ?? a.session_type;
          const name = et?.name ?? a.session_type;
          const cur = grouped.get(key);
          grouped.set(key, { name, qty: (cur?.qty ?? 0) + a.quantity_assigned });
        });
        return { ...b, allocations: allocs, totalCredits, completed, pills: Array.from(grouped.values()) };
      });
  }, [blocks, allocations, bookingsByBlock, eventTypes]);

  // Group rows by block_number
  const rowsByBlock = useMemo(() => {
    const map = new Map<number, Array<{ row: WeekRow; idx: number }>>();
    rows.forEach((row, idx) => {
      const arr = map.get(row.block_number) ?? [];
      arr.push({ row, idx });
      map.set(row.block_number, arr);
    });
    return map;
  }, [rows]);

  // Group client bookings by row index (week)
  const bookingsByRowIdx = useMemo(() => {
    const map: Record<number, ClientBooking[]> = {};
    clientBookings.forEach((b) => {
      const at = new Date(b.scheduled_at);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.monday_date) continue;
        const start = parseISO(r.monday_date);
        const end = addDays(start, 7);
        if (at >= start && at < end) {
          (map[i] ||= []).push(b);
          break;
        }
      }
    });
    return map;
  }, [clientBookings, rows]);

  function iconForSession(st: SessionType) {
    if ((st as string).toLowerCase().includes("triage")) return Stethoscope;
    return Dumbbell;
  }



  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/trainer/clients"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{clientName}</h1>
            <p className="text-sm text-muted-foreground mt-1">Pianificazione Calendario Percorso</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={resetSchedule} disabled={!pathStart || loading}>
            <RotateCcw className="size-4" /> Ricalcola
          </Button>
          <Button onClick={saveSchedule} disabled={!dirty || saving || loading}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salva Calendario
          </Button>
        </div>
      </div>

      {orphans.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-primary" /> Sessioni da Revisionare ({orphans.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Titolo</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphans.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-sm">
                      {format(parseISO(o.scheduled_at), "EEE dd MMM yyyy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{o.title ?? "(senza titolo)"}</div>
                      {o.notes && <div className="text-xs text-muted-foreground line-clamp-1">{o.notes}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="default" onClick={() => confirmOrphan(o)}>
                          <Check className="size-4" /> Conferma
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => discardOrphan(o)}>
                          <XIcon className="size-4" /> Scarta
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data Inizio Percorso</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-[260px] justify-start text-left font-normal",
                  !pathStart && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="size-4" />
                {pathStart ? format(pathStart, "EEEE dd MMMM yyyy", { locale: it }) : "Seleziona un lunedì"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={pathStart}
                onSelect={handleStartChange}
                weekStartsOn={1}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <p className="text-sm text-muted-foreground">
            Solo i lunedì sono validi. Settimane totali: <strong>{totalWeeks}</strong> ({totalBlocks} blocchi × {WEEKS_PER_BLOCK})
          </p>
        </CardContent>
      </Card>

      {/* Timeline del Percorso */}
      <div>
        <div className="mb-6">
          <h2 className="font-display text-3xl font-bold text-primary">Timeline del Percorso</h2>
          <p className="text-base text-muted-foreground mt-1">Pianificazione e stato degli appuntamenti</p>
        </div>

        {loading ? (
          <div className="p-8 grid place-items-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : totalBlocks === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground rounded-2xl border border-dashed">
            Nessun blocco assegnato a questo cliente. Crea il cliente con un percorso dalla pagina Clienti.
          </div>
        ) : (
          <div className="space-y-10">
            {blockAggregates.map((b) => {
              const blockRows = rowsByBlock.get(b.sequence_order) ?? [];
              const isComplete = b.totalCredits > 0 && b.completed >= b.totalCredits;
              return (
                <section key={b.id}>
                  {/* Block header */}
                  <div className="bg-card rounded-[32px] shadow-[0_4px_20px_rgba(0,86,133,0.05)] hover:shadow-[0_8px_24px_rgba(0,86,133,0.08)] transition-shadow duration-300 p-6 mb-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <h3 className="text-2xl font-semibold text-foreground">Blocco {b.sequence_order}</h3>
                      <div className="flex flex-wrap items-center gap-3">
                        {b.pills.length === 0 ? (
                          <span className="text-xs text-muted-foreground italic">Nessun credito impostato</span>
                        ) : (
                          b.pills.map((p, i) => (
                            <span
                              key={i}
                              className="bg-secondary text-secondary-foreground text-[13px] font-semibold px-3 py-1 rounded-full"
                            >
                              {p.qty} {p.name}
                            </span>
                          ))
                        )}
                        <div className="flex items-center gap-2 bg-muted px-3 py-1 rounded-full">
                          {isComplete ? (
                            <CheckCircle2 className="size-4 text-primary" />
                          ) : (
                            <Clock className="size-4 text-muted-foreground" />
                          )}
                          <span
                            className={cn(
                              "text-[13px] font-semibold",
                              isComplete ? "text-primary" : "text-muted-foreground",
                            )}
                          >
                            {b.completed} / {b.totalCredits} sessioni completate
                          </span>
                        </div>
                        <BlockCreditsDialog
                          blockId={b.id}
                          sequenceOrder={b.sequence_order}
                          allocations={b.allocations}
                          eventTypes={eventTypes.map((e) => ({ id: e.id, name: e.name, base_type: e.base_type }))}
                          onSaved={() => void load()}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4-week grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                    {blockRows.map(({ row, idx }) => {
                      const date = row.monday_date ? parseISO(row.monday_date) : null;
                      const isPast = date ? isBefore(date, today) : false;
                      const weekBookings = bookingsByRowIdx[idx] ?? [];
                      return (
                        <div key={row.week_number} className={cn("space-y-3", isPast && "opacity-60")}>
                          {/* Pill date header */}
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                className={cn(
                                  "w-full bg-[#eceef2] hover:bg-[#dfe2e8] transition-colors rounded-full px-4 py-2 flex items-center justify-between border",
                                  row.shifted ? "border-primary" : "border-transparent",
                                )}
                                title={row.shifted ? "Settimana spostata" : "Modifica data"}
                              >
                                <span className="text-sm font-bold text-[#191c1f] px-2">
                                  {date ? format(date, "EEEE d MMM", { locale: it }) : "—"}
                                </span>
                                <CalendarDays className="size-4 text-[#191c1f]" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={date ?? undefined}
                                onSelect={(d) => d && handleWeekDateChange(idx, d)}
                                weekStartsOn={1}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>

                          {/* Bookings */}
                          {weekBookings.length === 0 ? (
                            <div className="border border-dashed border-border rounded-2xl p-4 flex items-center justify-center text-center bg-background/50 h-24">
                              <span className="text-sm text-muted-foreground italic">
                                Nessun appuntamento previsto
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {weekBookings.map((bk) => {
                                const at = parseISO(bk.scheduled_at);
                                const et = eventTypes.find((e) => e.id === bk.event_type_id);
                                const Icon = iconForSession(bk.session_type);
                                const isCancelled =
                                  bk.status === "cancelled" ||
                                  bk.status === "late_cancelled" ||
                                  bk.status === "no_show";
                                const isCompleted = bk.status === "completed";
                                const durationMin = et?.duration ?? 60;
                                const end = addDays(at, 0);
                                end.setMinutes(end.getMinutes() + durationMin);
                                const timeRange = `${format(at, "HH:mm")} - ${format(end, "HH:mm")}`;
                                const label = et?.name ?? bk.title ?? bk.session_type;

                                if (isCancelled) {
                                  return (
                                    <div
                                      key={bk.id}
                                      onClick={() => setEditingBooking(bk)}
                                      className="cursor-pointer bg-[#d8dade] opacity-80 rounded-2xl p-3 flex items-start gap-3 shadow-sm hover:scale-[1.02] transition-transform"
                                    >
                                      <div className="bg-black/10 text-[#191c1f] p-2 rounded-full flex-shrink-0">
                                        <Ban className="size-4" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-xs text-[#191c1f]/70 mb-1 line-through">{timeRange}</p>
                                        <p className="text-sm text-[#191c1f] font-medium line-through truncate">
                                          🚫 {label}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                }

                                return (
                                  <div
                                    key={bk.id}
                                    onClick={() => setEditingBooking(bk)}
                                    className={cn(
                                      "cursor-pointer rounded-2xl p-3 flex items-start gap-3 shadow-sm bg-white border-l-4 hover:scale-[1.02] transition-transform",
                                      isCompleted ? "border-emerald-500" : "border-[#005685]",
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "p-2 rounded-full flex-shrink-0",
                                        isCompleted
                                          ? "bg-emerald-50 text-emerald-600"
                                          : "bg-[#005685]/10 text-[#005685]",
                                      )}
                                    >
                                      <Icon className="size-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs text-[#191c1f]/70 mb-1">{timeRange}</p>
                                      <p className="text-sm text-[#191c1f] font-semibold truncate">{label}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <EditBookingDialog
        booking={editingBooking}
        eventTypes={eventTypes.map((e) => ({ id: e.id, name: e.name, base_type: e.base_type }))}
        onClose={() => setEditingBooking(null)}
        onSave={saveBookingEdit}
        onUnlink={(b) => unlinkBooking(b, { confirmFirst: false })}
        onDeleteEverywhere={deleteBookingEverywhere}
      />

      {/* Suppress unused warning */}
      <span className="hidden">{firstName}{lastName}</span>
    </div>
  );
}

interface BlockCreditsDialogProps {
  blockId: string;
  sequenceOrder: number;
  allocations: AllocationRecord[];
  eventTypes: Array<{ id: string; name: string; base_type: SessionType }>;
  onSaved: () => void;
}

function BlockCreditsDialog({ blockId, sequenceOrder, allocations, eventTypes, onSaved }: BlockCreditsDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AllocationRecord[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(allocations.map((a) => ({ ...a })));
  }, [open, allocations]);

  function addRow() {
    const et = eventTypes[0];
    if (!et) {
      toast.error("Crea prima una Tipologia Evento.");
      return;
    }
    setDraft((prev) => [
      ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        block_id: blockId,
        event_type_id: et.id,
        session_type: et.base_type,
        quantity_assigned: 4,
        quantity_booked: 0,
        week_number: 1,
        valid_until: null,
      },
    ]);
  }

  function updateRow(id: string, patch: Partial<AllocationRecord>) {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setDraft((prev) => prev.filter((r) => r.id !== id));
  }

  async function save() {
    setSaving(true);
    try {
      const originalIds = new Set(allocations.map((a) => a.id));
      const draftIds = new Set(draft.filter((d) => !d.id.startsWith("new-")).map((d) => d.id));
      const toDelete = [...originalIds].filter((id) => !draftIds.has(id));
      if (toDelete.length > 0) {
        const { error } = await supabase.from("block_allocations").delete().in("id", toDelete);
        if (error) throw error;
      }
      for (const r of draft) {
        if (r.id.startsWith("new-")) {
          const { error } = await supabase.from("block_allocations").insert({
            block_id: blockId,
            event_type_id: r.event_type_id,
            session_type: r.session_type,
            quantity_assigned: r.quantity_assigned,
            quantity_booked: 0,
            week_number: r.week_number,
            valid_until: r.valid_until,
          });
          if (error) throw error;
        } else {
          const original = allocations.find((a) => a.id === r.id);
          if (
            !original ||
            original.event_type_id !== r.event_type_id ||
            original.quantity_assigned !== r.quantity_assigned ||
            original.session_type !== r.session_type
          ) {
            const { error } = await supabase
              .from("block_allocations")
              .update({
                event_type_id: r.event_type_id,
                session_type: r.session_type,
                quantity_assigned: r.quantity_assigned,
              })
              .eq("id", r.id);
            if (error) throw error;
          }
        }
      }
      toast.success("Crediti aggiornati");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error("Salvataggio non riuscito", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex items-center justify-center p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          title="Imposta Crediti"
          aria-label="Imposta Crediti"
        >
          <Edit3 className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crediti — Blocco {sequenceOrder}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun credito impostato.
            </p>
          )}
          {draft.map((r) => (
            <div key={r.id} className="grid grid-cols-12 gap-2 items-end rounded-md border p-2">
              <div className="col-span-7 space-y-1">
                <Label className="text-xs">Tipologia</Label>
                <Select
                  value={r.event_type_id ?? ""}
                  onValueChange={(v) => {
                    const et = eventTypes.find((e) => e.id === v);
                    updateRow(r.id, { event_type_id: v, session_type: et?.base_type ?? r.session_type });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                  <SelectContent>
                    {eventTypes.map((et) => (
                      <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-4 space-y-1">
                <Label className="text-xs">Crediti</Label>
                <Input
                  type="number"
                  min={1}
                  value={r.quantity_assigned}
                  onChange={(e) => updateRow(r.id, { quantity_assigned: Math.max(1, Number(e.target.value) || 1) })}
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button size="icon" variant="ghost" onClick={() => removeRow(r.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          <Button variant="secondary" size="sm" onClick={addRow}>
            <Plus className="size-4" /> Aggiungi
          </Button>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Annulla</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salva
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface EditBookingDialogProps {
  booking: ClientBooking | null;
  eventTypes: Array<{ id: string; name: string; base_type: SessionType }>;
  onClose: () => void;
  onSave: (input: {
    id: string;
    scheduled_at: string;
    event_type_id: string | null;
    session_type: SessionType;
    status: EditableStatus;
    block_id: string | null;
    prevStatus: string;
    prevEventTypeId: string | null;
    prevSessionType: SessionType;
  }) => Promise<void>;
  onUnlink: (b: ClientBooking) => Promise<void>;
  onDeleteEverywhere: (b: ClientBooking) => Promise<void>;
}

function EditBookingDialog({ booking, eventTypes, onClose, onSave, onUnlink, onDeleteEverywhere }: EditBookingDialogProps) {
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [eventTypeId, setEventTypeId] = useState<string>("");
  const [status, setStatus] = useState<EditableStatus>("scheduled");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!booking) return;
    const d = parseISO(booking.scheduled_at);
    setDate(format(d, "yyyy-MM-dd"));
    setTime(format(d, "HH:mm"));
    setEventTypeId(booking.event_type_id ?? "");
    const s = booking.status as EditableStatus;
    setStatus(["scheduled", "completed", "cancelled", "late_cancelled"].includes(s) ? s : "scheduled");
  }, [booking]);

  if (!booking) return null;

  async function handleSave() {
    if (!booking) return;
    if (!date || !time) {
      toast.error("Data e ora obbligatorie");
      return;
    }
    setSaving(true);
    try {
      const iso = new Date(`${date}T${time}:00`).toISOString();
      const et = eventTypes.find((e) => e.id === eventTypeId);
      await onSave({
        id: booking.id,
        scheduled_at: iso,
        event_type_id: eventTypeId || null,
        session_type: et?.base_type ?? booking.session_type,
        status,
        block_id: booking.block_id,
        prevStatus: booking.status,
        prevEventTypeId: booking.event_type_id,
        prevSessionType: booking.session_type,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!booking} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modifica Sessione</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ora</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipologia Evento</Label>
            <Select value={eventTypeId} onValueChange={setEventTypeId}>
              <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
              <SelectContent>
                {eventTypes.map((et) => (
                  <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Stato Sessione</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EditableStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Pianificata</SelectItem>
                <SelectItem value="completed">Completata</SelectItem>
                <SelectItem value="late_cancelled">Cancellata — Addebitata</SelectItem>
                <SelectItem value="cancelled">Cancellata — Rimborsata</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Annulla</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
