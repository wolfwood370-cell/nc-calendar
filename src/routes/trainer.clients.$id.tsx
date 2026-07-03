import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BlockCreditsDialog } from "@/components/block-credits-dialog";
import { EditBookingDialog, type EditableBooking } from "@/components/edit-booking-dialog";
import { OrphanBookingsCard } from "@/components/orphan-bookings-card";
import { PathStartDateCard } from "@/components/path-start-date-card";
import { TrainerBiaPanel } from "@/components/trainer-bia-panel";
import { CoachNotesCard } from "@/components/coach-notes-card";
import { AutoRenewToggleCard } from "@/components/auto-renew-toggle-card";
import { TimelineWeekRow } from "@/components/timeline-week-row";
import { AssignPackageDialog, type AssignPackagePayload } from "@/components/assign-package-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Loader2,
  Mail,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Unlink,
  Edit3,
  CheckCircle2,
  Clock,
  ChevronDown,
} from "lucide-react";
type EditableStatus = "scheduled" | "completed" | "cancelled" | "late_cancelled";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCoachEventTypes } from "@/lib/queries";
import { gcalDeleteEvent, gcalUpdateEvent } from "@/lib/gcal.functions";
import { queryKeys } from "@/lib/query-keys";
import type { SessionType } from "@/lib/mock-data";
import { toast } from "sonner";
import { format, addDays, startOfDay, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { cn, errorMessage } from "@/lib/utils";

const WEEKS_PER_BLOCK = 4;

// Palette chip stato "Storico sessioni" (mock Trainer Client Detail)
const STATUS_CHIP: Record<string, { bg: string; fg: string; label: string }> = {
  scheduled: { bg: "#e3f2fd", fg: "#1565c0", label: "Programmata" },
  completed: { bg: "#ecfdf5", fg: "#059669", label: "Presente" },
  late_cancelled: { bg: "#fef2f2", fg: "#dc2626", label: "No-show" },
  cancelled: { bg: "#fef2f2", fg: "#dc2626", label: "Annullata" },
};

// Colore tipologia (mock: PT #003e62, BIA #039BE5, Test #0b8043)
function creditColor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("bia")) return "#039be5";
  if (n.includes("test")) return "#0b8043";
  return "#003e62";
}

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
  // H3: per-booking duration snapshot, see queries.ts BookingRow.
  duration_min: number;
}

function toIso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function currentMonday(d: Date): Date {
  const day = d.getDay();
  // Snap to the Monday of the same week (never jumps forward).
  const diff = day === 0 ? 6 : day - 1;
  return addDays(startOfDay(d), -diff);
}

function isMonday(d: Date) {
  return d.getDay() === 1;
}

function ClientPathPage() {
  const { id: clientId } = useParams({ from: "/trainer/clients/$id" });
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const eventTypesQ = useCoachEventTypes(user?.id);
  const eventTypes = eventTypesQ.data ?? [];

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState<string>("");
  const [clientEmail, setClientEmail] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [pathStart, setPathStart] = useState<Date | undefined>(undefined);
  const [blocks, setBlocks] = useState<BlockRecord[]>([]);
  const [allocations, setAllocations] = useState<AllocationRecord[]>([]);
  const [completedByBlockType, setCompletedByBlockType] = useState<
    Record<string, Record<string, number>>
  >({});
  const [rows, setRows] = useState<WeekRow[]>([]);
  const [originalRows, setOriginalRows] = useState<WeekRow[]>([]);
  const [orphans, setOrphans] = useState<OrphanBooking[]>([]);
  const [clientBookings, setClientBookings] = useState<ClientBooking[]>([]);
  const [editingBooking, setEditingBooking] = useState<ClientBooking | null>(null);
  // Block auto-renew toggle (profiles.auto_renew_blocks, added by
  // 20260524110000_block_auto_renew.sql). Loaded lazily so we don't
  // block the rest of the page if the column hasn't been regenerated
  // in the Supabase types yet.
  const [autoRenewBlocks, setAutoRenewBlocks] = useState<boolean | null>(null);
  const [autoRenewSaving, setAutoRenewSaving] = useState(false);
  // "Assegna pacchetto" — configura percorso/crediti su un cliente esistente
  // (es. invitato, mai configurato). hasExtraCredits + blocks.length servono
  // come guardia: in v1 non sovrascriviamo un pacchetto già attivo.
  const [assignOpen, setAssignOpen] = useState(false);
  const [hasExtraCredits, setHasExtraCredits] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const totalBlocks = blocks.length;
  const totalWeeks = totalBlocks * WEEKS_PER_BLOCK;

  // N8 (audit 2026-06-03): generation counter per invalidare load() in volo
  // quando cambia il cliente o l'utente si dis-monta. Senza questo, ogni
  // setState dopo un await può sovrascrivere lo stato di un cliente diverso.
  const loadGenRef = useRef(0);

  useEffect(() => {
    if (!clientId || !user) return;
    void load();
    return () => {
      // Bumpa la generation: tutte le load() in volo diventano stali.
      loadGenRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, user?.id]);

  async function load() {
    if (!user) return;
    const gen = ++loadGenRef.current;
    const isStale = () => loadGenRef.current !== gen;
    setLoading(true);

    // M5 (audit): UNA sola lettura del profilo (prima erano due query separate
    // sulla stessa riga). auto_renew_blocks via cast — colonna aggiunta da
    // 20260524110000_block_auto_renew.sql, non ancora nei tipi generati.
    const sbProfile = supabase as unknown as {
      from: (t: "profiles") => {
        select: (cols: string) => {
          eq: (
            col: string,
            val: string,
          ) => {
            maybeSingle: () => Promise<{
              data: {
                id: string;
                full_name: string | null;
                email: string | null;
                path_start_date: string | null;
                auto_renew_blocks: boolean | null;
              } | null;
            }>;
          };
        };
      };
    };
    const { data: profile } = await sbProfile
      .from("profiles")
      .select("id, full_name, email, path_start_date, auto_renew_blocks")
      .eq("id", clientId)
      .maybeSingle();
    if (isStale()) return;

    if (!profile) {
      toast.error("Cliente non trovato o non autorizzato.");
      navigate({ to: "/trainer/clients" });
      return;
    }

    const fn = profile.full_name ?? profile.email ?? "Cliente";
    setClientName(fn);
    setClientEmail(profile.email ?? "");
    const parts = (profile.full_name ?? "").trim().split(/\s+/);
    setFirstName(parts[0] ?? "");
    setLastName(parts.slice(1).join(" "));
    setPathStart(profile.path_start_date ? parseISO(profile.path_start_date) : undefined);
    setAutoRenewBlocks(profile.auto_renew_blocks ?? true);

    const { data: bls } = await supabase
      .from("training_blocks")
      .select("id, sequence_order")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("sequence_order", { ascending: true });
    if (isStale()) return;
    const blockList = (bls ?? []).map((b) => ({
      id: b.id as string,
      sequence_order: b.sequence_order as number,
    }));
    setBlocks(blockList);
    const blockIds = blockList.map((b) => b.id);

    if (blockIds.length > 0) {
      const { data: allocs } = await supabase
        .from("block_allocations")
        .select(
          "id, block_id, event_type_id, session_type, quantity_assigned, quantity_booked, week_number, valid_until",
        )
        .in("block_id", blockIds);
      if (isStale()) return;
      setAllocations((allocs ?? []) as AllocationRecord[]);
    } else {
      setAllocations([]);
    }

    // Conteggio crediti extra (per la guardia di "Assegna pacchetto": un
    // cliente Libero non ha blocchi ma può avere extra_credits già assegnati).
    const { data: ec } = await supabase
      .from("extra_credits")
      .select("id")
      .eq("client_id", clientId)
      .limit(1);
    if (isStale()) return;
    setHasExtraCredits((ec ?? []).length > 0);
    // M5 (audit): completedByBlockType viene calcolato piu' sotto dai booking
    // del cliente gia' caricati (clientBookings), evitando una seconda query.

    const { data: existing } = await supabase
      .from("weekly_schedule")
      .select("week_number, block_number, monday_date, shifted")
      .eq("client_id", clientId)
      .order("week_number", { ascending: true });
    if (isStale()) return;

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
    const start = profile?.path_start_date
      ? parseISO(profile.path_start_date as string)
      : undefined;
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
      .select(
        "id, scheduled_at, title, status, block_id, event_type_id, session_type, google_event_id, created_at, duration_min",
      )
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("scheduled_at", { ascending: false });
    if (isStale()) return;
    const bookingsList = (cbs ?? []) as ClientBooking[];
    setClientBookings(bookingsList);

    // M5 (audit): completati per blocco/tipo calcolati dai booking gia' caricati
    // (bookingsList include block_id/status/event_type_id/session_type), invece
    // di una seconda query dedicata su bookings.
    const completedCounts: Record<string, Record<string, number>> = {};
    bookingsList.forEach((b) => {
      const bid = b.block_id;
      if (!bid || b.status !== "completed") return;
      const key = b.event_type_id ?? b.session_type;
      const bucket = (completedCounts[bid] ||= {});
      bucket[key] = (bucket[key] ?? 0) + 1;
    });
    setCompletedByBlockType(completedCounts);

    // Toast: nuove sessioni auto-assegnate negli ultimi 5 minuti
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const recentAuto = bookingsList.filter(
      (b) => b.google_event_id && new Date(b.created_at).getTime() > fiveMinAgo,
    ).length;
    if (recentAuto > 0) {
      toast.success(
        `Ho assegnato automaticamente ${recentAuto} ${recentAuto === 1 ? "nuova sessione" : "nuove sessioni"} a questo cliente.`,
      );
    }

    await loadOrphans(fn);
    if (isStale()) return;
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
    const matches = (
      (data ?? []) as Array<OrphanBooking & { ignored_by_clients: string[] | null }>
    ).filter((b) => {
      const ign = (b.ignored_by_clients ?? []) as string[];
      if (ign.includes(clientId)) return false;
      const hay = `${b.title ?? ""} ${b.notes ?? ""}`.toLowerCase();
      const f = first.toLowerCase();
      const l = last.toLowerCase();
      if (!f) return false;
      if (l) return hay.includes(f) && hay.includes(l);
      return hay.includes(f);
    });
    setOrphans(
      matches.map((m) => ({
        id: m.id,
        scheduled_at: m.scheduled_at,
        title: m.title,
        notes: m.notes,
        event_type_id: m.event_type_id,
        session_type: m.session_type,
      })),
    );
  }

  async function confirmOrphan(o: OrphanBooking) {
    // Try to attach to first active block with available allocation for that event_type
    let blockId: string | null = null;
    let attached = false;
    let usedExtraCredit = false;
    if (o.event_type_id) {
      const sortedBlocks = [...blocks].sort((a, b) => a.sequence_order - b.sequence_order);
      for (const b of sortedBlocks) {
        const candidate = allocations.find(
          (a) =>
            a.block_id === b.id &&
            a.event_type_id === o.event_type_id &&
            a.quantity_booked < a.quantity_assigned,
        );
        if (candidate) {
          blockId = b.id;
          attached = true;
          await supabase
            .from("block_allocations")
            .update({ quantity_booked: candidate.quantity_booked + 1 })
            .eq("id", candidate.id);
          break;
        }
      }
    }
    // Fallback: scala da extra_credits del cliente per quell'event_type (Cliente Libero o blocco esaurito).
    if (!attached && o.event_type_id) {
      const nowIso = new Date().toISOString();
      const { data: ecRows } = await supabase
        .from("extra_credits")
        .select("id, quantity, quantity_booked, expires_at")
        .eq("client_id", clientId)
        .eq("event_type_id", o.event_type_id)
        .gte("expires_at", nowIso)
        .order("expires_at", { ascending: true });
      const ec = (ecRows ?? []).find((r) => r.quantity - r.quantity_booked > 0);
      if (ec) {
        await supabase
          .from("extra_credits")
          .update({ quantity_booked: ec.quantity_booked + 1 })
          .eq("id", ec.id);
        usedExtraCredit = true;
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
    toast.success(
      usedExtraCredit
        ? "Sessione salvata (Scalata da crediti omaggio/extra)"
        : attached
          ? "Sessione associata al cliente"
          : "Sessione associata (nessun credito scalato)",
    );
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

  async function unlinkBooking(
    b: ClientBooking,
    opts: { confirmFirst?: boolean; silent?: boolean } = {},
  ) {
    if (opts.confirmFirst !== false) {
      if (
        !confirm(
          "Scollegare questa sessione dal profilo? Verrà ignorata dallo Smart Matcher per questo cliente.",
        )
      )
        return;
    }
    // Restituisci credito se era contabilizzato
    if (b.block_id) {
      const alloc = allocations.find(
        (a) =>
          a.block_id === b.block_id &&
          (b.event_type_id
            ? a.event_type_id === b.event_type_id
            : a.session_type === b.session_type) &&
          a.quantity_booked > 0,
      );
      if (alloc) {
        await supabase
          .from("block_allocations")
          .update({ quantity_booked: Math.max(0, alloc.quantity_booked - 1) })
          .eq("id", alloc.id);
      }
    } else if (b.event_type_id) {
      // Refund extra_credits per cliente indipendente / booster
      const { data: ecRows } = await supabase
        .from("extra_credits")
        .select("id, quantity_booked")
        .eq("client_id", clientId)
        .eq("event_type_id", b.event_type_id)
        .gt("quantity_booked", 0)
        .order("expires_at", { ascending: true })
        .limit(1);
      const ec = (ecRows ?? [])[0];
      if (ec) {
        await supabase
          .from("extra_credits")
          .update({ quantity_booked: Math.max(0, ec.quantity_booked - 1) })
          .eq("id", ec.id);
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
    // Sync Google Calendar delete via Lovable Connector
    if (b.google_event_id) {
      try {
        await gcalDeleteEvent({ data: { googleEventId: b.google_event_id } });
      } catch (err) {
        console.error("gcalDeleteEvent failed", err);
      }
    }
    // Restituisci credito se era contabilizzato
    if (b.block_id) {
      const alloc = allocations.find(
        (a) =>
          a.block_id === b.block_id &&
          (b.event_type_id
            ? a.event_type_id === b.event_type_id
            : a.session_type === b.session_type) &&
          a.quantity_booked > 0,
      );
      if (alloc) {
        await supabase
          .from("block_allocations")
          .update({ quantity_booked: Math.max(0, alloc.quantity_booked - 1) })
          .eq("id", alloc.id);
      }
    } else if (b.event_type_id) {
      // Refund extra_credits per cliente indipendente / booster
      const { data: ecRows } = await supabase
        .from("extra_credits")
        .select("id, quantity_booked")
        .eq("client_id", clientId)
        .eq("event_type_id", b.event_type_id)
        .gt("quantity_booked", 0)
        .order("expires_at", { ascending: true })
        .limit(1);
      const ec = (ecRows ?? [])[0];
      if (ec) {
        await supabase
          .from("extra_credits")
          .update({ quantity_booked: Math.max(0, ec.quantity_booked - 1) })
          .eq("id", ec.id);
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
        (a) =>
          a.block_id === input.block_id &&
          (input.prevEventTypeId
            ? a.event_type_id === input.prevEventTypeId
            : a.session_type === input.prevSessionType) &&
          a.quantity_booked > 0,
      );
      if (alloc) {
        await supabase
          .from("block_allocations")
          .update({ quantity_booked: Math.max(0, alloc.quantity_booked - 1) })
          .eq("id", alloc.id);
      }
    } else if (
      input.status === "cancelled" &&
      wasActive &&
      !input.block_id &&
      input.prevEventTypeId
    ) {
      // Refund extra_credits per cliente indipendente / booster
      const { data: ecRows } = await supabase
        .from("extra_credits")
        .select("id, quantity_booked")
        .eq("client_id", clientId)
        .eq("event_type_id", input.prevEventTypeId)
        .gt("quantity_booked", 0)
        .order("expires_at", { ascending: true })
        .limit(1);
      const ec = (ecRows ?? [])[0];
      if (ec) {
        await supabase
          .from("extra_credits")
          .update({ quantity_booked: Math.max(0, ec.quantity_booked - 1) })
          .eq("id", ec.id);
      }
    }

    // A3 (audit 2026-06-06): sincronizza Google Calendar. Prima saveBookingEdit
    // aggiornava SOLO il DB -> spostare l'orario lasciava un promemoria Google
    // sbagliato e annullare lasciava l'evento Google "fantasma" coi reminder.
    // Fire-and-forget come gli altri call-site gcal: l'esito non blocca
    // l'aggiornamento DB gia' riuscito.
    const editedBk = clientBookings.find((x) => x.id === input.id);
    const googleEventId = editedBk?.google_event_id ?? null;
    if (googleEventId) {
      if (input.status === "cancelled") {
        void gcalDeleteEvent({ data: { googleEventId } }).catch((e) =>
          console.error("gcalDeleteEvent (saveBookingEdit) failed", e),
        );
      } else {
        const durationMin =
          (input.event_type_id
            ? eventTypes.find((et) => et.id === input.event_type_id)?.duration
            : undefined) ??
          editedBk?.duration_min ??
          60;
        const startISO = new Date(input.scheduled_at).toISOString();
        const endISO = new Date(
          new Date(input.scheduled_at).getTime() + durationMin * 60_000,
        ).toISOString();
        void gcalUpdateEvent({ data: { googleEventId, startISO, endISO } }).catch((e) =>
          console.error("gcalUpdateEvent (saveBookingEdit) failed", e),
        );
      }
    }

    toast.success("Sessione aggiornata e contatori sincronizzati");
    qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.bookings.client(clientId) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.client(clientId) });
    qc.invalidateQueries({ queryKey: queryKeys.extraCredits.client(clientId) });
    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
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
    // Allow any date (including past): snap to Monday of the same week.
    const m = isMonday(d) ? d : currentMonday(d);
    setPathStart(m);
    regenerateFromStart(m);
  }

  function handleWeekDateChange(weekIndex: number, newDate: Date) {
    const monday = isMonday(newDate) ? newDate : currentMonday(newDate);
    const updated = [...rows];
    const target = updated[weekIndex];
    if (!target) return;
    updated[weekIndex] = {
      ...target,
      monday_date: toIso(monday),
      shifted: true,
    };
    for (let i = weekIndex + 1; i < updated.length; i++) {
      const next = updated[i];
      if (!next) continue;
      updated[i] = {
        ...next,
        monday_date: toIso(addDays(monday, (i - weekIndex) * 7)),
        shifted: next.shifted,
      };
    }
    setRows(updated);
  }

  function resetSchedule() {
    if (!pathStart) return;
    regenerateFromStart(pathStart);
    toast.success("Calendario ricalcolato dalla data di inizio");
  }

  async function toggleAutoRenew(next: boolean) {
    if (autoRenewSaving) return;
    setAutoRenewSaving(true);
    // Optimistic update — revert on error so the Switch reflects truth.
    const prev = autoRenewBlocks;
    setAutoRenewBlocks(next);
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
    if (error) {
      setAutoRenewBlocks(prev);
      toast.error("Errore aggiornamento", { description: error.message });
    } else {
      toast.success(next ? "Rinnovo automatico attivato" : "Rinnovo automatico disattivato");
    }
    setAutoRenewSaving(false);
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
      toast.error("Salvataggio non riuscito", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  // Assegna un pacchetto a QUESTO cliente (esistente). Replica la logica di
  // onboarding di trainer.clients.index.tsx (createClientAccount) ma senza
  // creare l'utente: si limita a creare blocchi+allocations oppure
  // extra_credits e a impostare i metadati del profilo (incl. path_start_date,
  // la cui assenza lasciava i clienti invitati "vuoti").
  // GUARDIA: il dialog è in sola lettura se il cliente ha già blocchi o crediti;
  // ricontrolliamo anche qui server-side-ish prima di scrivere.
  async function assignPackage(data: AssignPackagePayload) {
    if (!user) return;
    if (blocks.length > 0 || hasExtraCredits) {
      toast.error("Il cliente ha già un pacchetto attivo", {
        description:
          "Ricarica la pagina: l'assegnazione è consentita solo a clienti senza percorso/crediti.",
      });
      return;
    }
    setAssigning(true);
    try {
      if (data.pathType === "free") {
        // Cliente Libero / PT Pack: crediti extra (validità 1 anno), nessun blocco.
        const qty = Math.max(0, data.freeSessions ?? 0);
        const eventTypeId = data.freeEventTypeId ?? "";
        if (qty > 0 && eventTypeId) {
          const expires = new Date();
          expires.setFullYear(expires.getFullYear() + 1);
          const { error: ecErr } = await supabase.from("extra_credits").insert({
            client_id: clientId,
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
          .eq("id", clientId);
        if (pErr) throw pErr;
      } else {
        // Percorso Fisso / Abbonamento: blocchi + allocations a partire da oggi.
        const today = new Date();
        const blocksToInsert = Array.from({ length: data.totalBlocks }, (_, i) => {
          const start = new Date(today);
          start.setDate(today.getDate() + i * 30);
          const end = new Date(today);
          end.setDate(today.getDate() + (i + 1) * 30 - 1);
          return {
            client_id: clientId,
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

        // path_start_date = oggi (= start del blocco 1). Senza, repair/ensure
        // ritornano no_anchor e il cron auto-renew salta il cliente.
        const today2 = new Date();
        const nextBilling = new Date(today2);
        nextBilling.setDate(today2.getDate() + 30);
        const pathStartIso = today2.toISOString().slice(0, 10);
        const { error: pErr } = await supabase
          .from("profiles")
          .update({
            path_type: data.pathType,
            auto_renew: data.autoRenew,
            auto_renew_blocks: data.autoRenew,
            pack_label: data.packLabel,
            path_start_date: pathStartIso,
            next_billing_date:
              data.pathType === "recurring" ? nextBilling.toISOString().slice(0, 10) : null,
          })
          .eq("id", clientId);
        if (pErr) throw pErr;
      }

      toast.success("Pacchetto assegnato", {
        description:
          data.pathType === "free"
            ? "Crediti accreditati al cliente."
            : `Creati ${data.totalBlocks} blocchi con i crediti impostati.`,
      });
      setAssignOpen(false);
      qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user.id) });
      qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(user.id) });
      await load();
    } catch (e) {
      toast.error("Assegnazione non riuscita", { description: errorMessage(e) });
    } finally {
      setAssigning(false);
    }
  }

  const dirty = useMemo(() => {
    if (rows.length !== originalRows.length) return true;
    return rows.some(
      (r, i) =>
        r.monday_date !== originalRows[i]?.monday_date || r.shifted !== originalRows[i]?.shifted,
    );
  }, [rows, originalRows]);

  const today = startOfDay(new Date());

  // Group rows by block_number (needed by blockAggregates for date ranges)
  const rowsByBlock = useMemo(() => {
    const map = new Map<number, Array<{ row: WeekRow; idx: number }>>();
    rows.forEach((row, idx) => {
      const arr = map.get(row.block_number) ?? [];
      arr.push({ row, idx });
      map.set(row.block_number, arr);
    });
    return map;
  }, [rows]);

  // Map sequence_order -> block aggregate. La completion viene calcolata
  // sulle date reali del blocco (non sul block_id) per essere robusta a
  // booking importati senza assegnazione di credito.
  const blockAggregates = useMemo(() => {
    const sorted = blocks.slice().sort((a, b) => a.sequence_order - b.sequence_order);
    return sorted.map((b, sortedIdx) => {
      const allocs = allocations.filter((a) => a.block_id === b.id);
      const blockNumber = sortedIdx + 1;
      const blockRows = rowsByBlock.get(blockNumber) ?? [];
      const dateRange: { start: Date | null; end: Date | null } = { start: null, end: null };
      if (blockRows.length > 0) {
        const firstMon = blockRows[0]?.row.monday_date;
        const lastMon = blockRows[blockRows.length - 1]?.row.monday_date;
        if (firstMon) dateRange.start = parseISO(firstMon);
        if (lastMon) dateRange.end = addDays(parseISO(lastMon), 7);
      }
      const inRange = (iso: string) => {
        if (!dateRange.start || !dateRange.end) return false;
        const t = new Date(iso).getTime();
        return t >= dateRange.start.getTime() && t < dateRange.end.getTime();
      };
      const grouped = new Map<string, { name: string; assigned: number; completed: number }>();
      allocs.forEach((a) => {
        const et = eventTypes.find((e) => e.id === a.event_type_id);
        const key = a.event_type_id ?? a.session_type;
        const name = et?.name ?? a.session_type;
        const completed = clientBookings.filter((bk) => {
          if (bk.status !== "completed") return false;
          if (a.event_type_id) {
            if (bk.event_type_id !== a.event_type_id) return false;
          } else {
            if (bk.event_type_id || bk.session_type !== a.session_type) return false;
          }
          return inRange(bk.scheduled_at);
        }).length;
        const cur = grouped.get(key);
        grouped.set(key, {
          name,
          assigned: (cur?.assigned ?? 0) + a.quantity_assigned,
          completed: cur ? cur.completed : completed,
        });
      });
      const pills = Array.from(grouped.values());
      return { ...b, allocations: allocs, pills, dateRange };
    });
  }, [blocks, allocations, clientBookings, rowsByBlock, eventTypes]);

  // Accordion state — solo un blocco aperto alla volta. Default: il blocco
  // corrente (today nel range) o il primo se non c'è nessun match.
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  useEffect(() => {
    if (blockAggregates.length === 0) {
      setOpenBlockId(null);
      return;
    }
    setOpenBlockId((prev) => {
      if (prev && blockAggregates.some((b) => b.id === prev)) return prev;
      const now = today.getTime();
      const current = blockAggregates.find(
        (b) =>
          b.dateRange.start &&
          b.dateRange.end &&
          now >= b.dateRange.start.getTime() &&
          now < b.dateRange.end.getTime(),
      );
      return (current ?? blockAggregates[0]!).id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockAggregates.length]);

  // Group client bookings by row index (week)
  const bookingsByRowIdx = useMemo(() => {
    const map: Record<number, ClientBooking[]> = {};
    clientBookings.forEach((b) => {
      const at = new Date(b.scheduled_at);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r?.monday_date) continue;
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

  // Derivazioni SOLO presentazionali per header, "Pacchetto & percorso" ed
  // "Engagement" (design handoff Trainer Client Detail): nessuna query extra,
  // tutto ricavato da blocchi/booking già caricati.
  const pkg = useMemo(() => {
    const nowMs = today.getTime();
    const current = blockAggregates.find(
      (b) =>
        b.dateRange.start &&
        b.dateRange.end &&
        nowMs >= b.dateRange.start.getTime() &&
        nowMs < b.dateRange.end.getTime(),
    );
    const lastEnd = blockAggregates.reduce<Date | null>(
      (acc, b) => (b.dateRange.end && (!acc || b.dateRange.end > acc) ? b.dateRange.end : acc),
      null,
    );
    const finished = totalBlocks > 0 && !!lastEnd && nowMs >= lastEnd.getTime();
    const currentNum =
      current?.sequence_order ?? (finished ? totalBlocks : totalBlocks > 0 ? 1 : 0);
    const expiry = lastEnd ? addDays(lastEnd, -1) : null;
    const expiringSoon =
      !!current &&
      current.sequence_order === totalBlocks &&
      !!lastEnd &&
      lastEnd.getTime() - nowMs < 14 * 86400000;
    // Barre crediti aggregate per tipologia su tutto il percorso
    const grouped = new Map<string, { name: string; assigned: number; completed: number }>();
    blockAggregates.forEach((b) =>
      b.pills.forEach((p) => {
        const cur = grouped.get(p.name);
        grouped.set(p.name, {
          name: p.name,
          assigned: (cur?.assigned ?? 0) + p.assigned,
          completed: (cur?.completed ?? 0) + p.completed,
        });
      }),
    );
    const status = expiringSoon
      ? { label: "In Scadenza", bg: "#fff7ed", fg: "#ea580c" }
      : current || hasExtraCredits
        ? { label: "Attivo", bg: "#ecfdf5", fg: "#059669" }
        : finished
          ? { label: "Completato", bg: "#eceef2", fg: "#41474f" }
          : null;
    return { currentNum, expiry, expiringSoon, bars: Array.from(grouped.values()), status };
  }, [blockAggregates, totalBlocks, hasExtraCredits, today]);

  const engage = useMemo(() => {
    const past = clientBookings.filter((b) => b.status !== "scheduled");
    const done = past.filter((b) => b.status === "completed").length;
    const att = past.length ? Math.round((done / past.length) * 100) : 100;
    const noshow = past.filter((b) => b.status === "late_cancelled").length;
    const completedTimes = clientBookings
      .filter((b) => b.status === "completed")
      .map((b) => new Date(b.scheduled_at).getTime());
    let perWeek = "—";
    if (completedTimes.length > 0) {
      const weeks =
        Math.max(
          1,
          Math.round((Math.max(...completedTimes) - Math.min(...completedTimes)) / (7 * 86400000)),
        ) + 1;
      perWeek = `~${Math.max(1, Math.round(completedTimes.length / weeks))}`;
    }
    const last = past[0];
    return {
      att,
      noshow,
      perWeek,
      lastLabel: last ? format(new Date(last.scheduled_at), "EEE d MMM", { locale: it }) : "—",
    };
  }, [clientBookings]);

  const initials =
    clientName
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "C";

  return (
    <div className="space-y-6">
      {/* Header cliente — card anagrafica (design handoff) */}
      <section className="bg-surface-container-lowest rounded-[28px] shadow-soft-blue p-6 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5 min-w-0">
          <Button variant="ghost" size="icon" asChild className="shrink-0 -ml-2">
            <Link to="/trainer/clients" aria-label="Torna ai clienti">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="size-[72px] rounded-full bg-avatar-placeholder text-on-avatar-placeholder grid place-items-center text-2xl font-extrabold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-bold tracking-[-0.02em] text-on-surface m-0">
              {clientName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              {pkg.status && (
                <span
                  className="text-[11px] font-semibold px-3 py-[3px] rounded-full"
                  style={{ background: pkg.status.bg, color: pkg.status.fg }}
                >
                  {pkg.status.label}
                </span>
              )}
              {(totalBlocks > 0 || hasExtraCredits) && (
                <span className="text-[11px] font-semibold px-3 py-[3px] rounded-full bg-aura-primary/8 text-aura-primary">
                  {totalBlocks > 0 ? `Percorso · ${totalBlocks} blocchi` : "Cliente Libero"}
                </span>
              )}
            </div>
            {clientEmail && (
              <div className="flex flex-wrap items-center gap-4 mt-2.5 text-[13px] text-outline">
                <span className="flex items-center gap-1.5">
                  <Mail className="size-[15px]" aria-hidden />
                  {clientEmail}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setAssignOpen(true)}
            disabled={loading || assigning}
            className="h-auto rounded-full border-0 bg-surface-container px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high"
          >
            <Plus className="size-4" /> Assegna pacchetto
          </Button>
          <Button
            variant="outline"
            onClick={resetSchedule}
            disabled={!pathStart || loading}
            className="h-auto rounded-full border-0 bg-surface-container px-5 py-2.5 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high"
          >
            <RotateCcw className="size-4" /> Ricalcola
          </Button>
          <Button
            onClick={saveSchedule}
            disabled={!dirty || saving || loading}
            className="h-auto rounded-full bg-aura-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-aura-primary/90"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salva Calendario
          </Button>
        </div>
      </section>

      {/* Layout a due colonne 1.6fr/1fr al breakpoint desktop (design handoff) */}
      <div className="grid gap-6 items-start xl:grid-cols-[1.6fr_1fr]">
        {/* Colonna sinistra: pacchetto, storico e sezioni operative */}
        <div className="flex flex-col gap-6 min-w-0">
          {/* Pacchetto & percorso — progresso blocchi + crediti a barre */}
          <section className="bg-surface-container-lowest rounded-[28px] shadow-soft-blue p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-semibold text-on-surface m-0">
                Pacchetto &amp; percorso
              </h2>
              <span className="text-xs text-outline">
                Scadenza:{" "}
                <strong className={pkg.expiringSoon ? "text-warning-strong" : "text-on-surface"}>
                  {pkg.expiry ? format(pkg.expiry, "d MMM yyyy", { locale: it }) : "—"}
                </strong>
              </span>
            </div>
            {totalBlocks > 0 ? (
              <div className="mb-5">
                <div className="flex justify-between text-[13px] mb-1.5">
                  <span className="font-semibold text-on-surface-variant">
                    Blocco {pkg.currentNum} di {totalBlocks}
                  </span>
                  <span className="tabular-nums text-aura-primary">
                    {Math.round((pkg.currentNum / totalBlocks) * 100)}%
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {Array.from({ length: totalBlocks }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex-1 h-2.5 rounded-full",
                        i < pkg.currentNum ? "bg-aura-primary" : "bg-surface-container-high",
                      )}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-outline m-0 mb-5">
                Cliente a consumo · nessun percorso a blocchi.
              </p>
            )}
            <div className="flex flex-col gap-4">
              {pkg.bars.length === 0 ? (
                <p className="text-[13px] text-outline m-0">Nessun credito impostato.</p>
              ) : (
                pkg.bars.map((barRow) => {
                  const color = creditColor(barRow.name);
                  const pct = barRow.assigned
                    ? Math.round((barRow.completed / barRow.assigned) * 100)
                    : 0;
                  return (
                    <div key={barRow.name} className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[13px]">
                        <span className="font-semibold text-on-surface-variant">{barRow.name}</span>
                        <span className="tabular-nums" style={{ color }}>
                          {barRow.completed}/{barRow.assigned}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ background: color, width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {pkg.expiringSoon && (
              <div className="mt-5 flex items-center justify-between gap-3 bg-[#fff7ed] border border-[#fde68a] rounded-2xl px-4 py-3">
                <span className="text-[13px] text-[#92400e]">
                  ⚠️ Pacchetto in esaurimento — proponi il rinnovo.
                </span>
              </div>
            )}
          </section>

          {/* Storico sessioni — righe con barretta colore tipologia e chip stato */}
          <section className="bg-surface-container-lowest rounded-[28px] shadow-soft-blue p-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold text-on-surface m-0">Storico sessioni</h2>
              <span className="text-xs text-outline">Tocca una sessione per modificare</span>
            </div>
            {loading ? (
              <div className="py-6 grid place-items-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : clientBookings.length === 0 ? (
              <p className="text-[13px] text-outline py-3 m-0">Nessuna sessione registrata.</p>
            ) : (
              clientBookings.slice(0, 12).map((b, i, arr) => {
                const et = eventTypes.find((e) => e.id === b.event_type_id);
                const name = et?.name ?? b.title ?? "Sessione";
                const color = creditColor(name);
                const chip = STATUS_CHIP[b.status] ?? STATUS_CHIP.scheduled!;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setEditingBooking(b)}
                    className={cn(
                      "w-full flex gap-3.5 py-3.5 text-left",
                      i < arr.length - 1 && "border-b border-[#f1f5f9]",
                    )}
                  >
                    <div
                      className="w-1.5 rounded-full shrink-0 self-stretch"
                      style={{ background: color }}
                    />
                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <strong className="text-sm text-on-surface truncate">{name}</strong>
                        <span className="text-xs text-outline shrink-0">
                          {format(new Date(b.scheduled_at), "EEE d MMM", { locale: it })}
                        </span>
                      </div>
                      <span
                        className="shrink-0 text-[11px] font-semibold px-3 py-[3px] rounded-full"
                        style={{ background: chip.bg, color: chip.fg }}
                      >
                        {chip.label}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </section>

          <OrphanBookingsCard
            orphans={orphans}
            onConfirm={confirmOrphan}
            onDiscard={discardOrphan}
          />

          <PathStartDateCard
            pathStart={pathStart}
            onSelectStart={handleStartChange}
            totalWeeks={totalWeeks}
            totalBlocks={totalBlocks}
            weeksPerBlock={WEEKS_PER_BLOCK}
          />

          {/* Auto-renew toggle for monthly blocks. Default ON for new clients.
              When OFF, the ensure_client_block_state RPC stops creating new
              blocks once the current one expires past its grace period —
              the cliente will see the empty state until the coach manually
              intervenes. */}
          <AutoRenewToggleCard
            value={autoRenewBlocks}
            saving={autoRenewSaving}
            onChange={toggleAutoRenew}
          />

          {/* Timeline del Percorso */}
          <div>
            <div className="mb-6">
              {/* Heading allineato alla scala titoli card del mock (20px/600) */}
              <h2 className="text-xl font-semibold text-on-surface">Timeline del Percorso</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Pianificazione e stato delle sessioni
              </p>
            </div>

            {loading ? (
              <div className="p-8 grid place-items-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </div>
            ) : totalBlocks === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed space-y-3">
                {hasExtraCredits ? (
                  <p className="text-sm text-muted-foreground">
                    Cliente Libero: ha crediti extra ma nessun percorso a blocchi. La Timeline
                    mostra solo i percorsi strutturati (Fisso / Abbonamento).
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Questo cliente non ha ancora un pacchetto assegnato.
                    </p>
                    <Button onClick={() => setAssignOpen(true)} disabled={assigning}>
                      <Plus className="size-4" /> Assegna pacchetto
                    </Button>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {blockAggregates.map((b) => {
                  const blockRows = rowsByBlock.get(b.sequence_order) ?? [];
                  const isOpen = openBlockId === b.id;
                  const totalAssigned = b.pills.reduce((s, p) => s + p.assigned, 0);
                  const totalCompleted = b.pills.reduce((s, p) => s + p.completed, 0);
                  const rangeLabel =
                    b.dateRange.start && b.dateRange.end
                      ? `${format(b.dateRange.start, "d MMM", { locale: it })} – ${format(
                          addDays(b.dateRange.end, -1),
                          "d MMM",
                          { locale: it },
                        )}`
                      : null;
                  const now = today.getTime();
                  const isCurrent =
                    b.dateRange.start &&
                    b.dateRange.end &&
                    now >= b.dateRange.start.getTime() &&
                    now < b.dateRange.end.getTime();
                  return (
                    <section
                      key={b.id}
                      className="bg-surface-container-lowest rounded-[28px] shadow-soft-blue overflow-hidden"
                    >
                      {/* Compact header — toggle */}
                      <button
                        type="button"
                        onClick={() => setOpenBlockId(isOpen ? null : b.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                        aria-expanded={isOpen}
                      >
                        <ChevronDown
                          className={cn(
                            "size-4 text-muted-foreground shrink-0 transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">
                            Blocco {b.sequence_order}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                              In corso
                            </span>
                          )}
                          {rangeLabel && (
                            <span className="text-xs text-muted-foreground">· {rangeLabel}</span>
                          )}
                        </div>
                        {totalAssigned > 0 && (
                          <span className="text-xs font-medium text-muted-foreground shrink-0">
                            {totalCompleted}/{totalAssigned}
                          </span>
                        )}
                      </button>

                      {/* Expanded body */}
                      {isOpen && (
                        <div className="px-4 pb-5 pt-1 space-y-4 border-t border-border/30">
                          <div className="flex flex-wrap items-center gap-2 pt-3">
                            {b.pills.length === 0 ? (
                              <span className="text-xs text-muted-foreground italic">
                                Nessun credito impostato
                              </span>
                            ) : (
                              b.pills.map((p, i) => {
                                const done = p.completed >= p.assigned;
                                return (
                                  <span
                                    key={i}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                                      done
                                        ? "bg-primary/10 text-primary"
                                        : "bg-surface-container-low text-primary",
                                    )}
                                  >
                                    {done ? (
                                      <CheckCircle2 className="size-3" />
                                    ) : (
                                      <Clock className="size-3" />
                                    )}
                                    {p.name}: {p.completed}/{p.assigned}
                                  </span>
                                );
                              })
                            )}
                            <BlockCreditsDialog
                              blockId={b.id}
                              sequenceOrder={b.sequence_order}
                              allocations={b.allocations}
                              eventTypes={eventTypes.map((e) => ({
                                id: e.id,
                                name: e.name,
                                base_type: e.base_type,
                              }))}
                              onSaved={() => void load()}
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            {blockRows.map(({ row, idx }) => (
                              <TimelineWeekRow
                                key={row.week_number}
                                row={row}
                                idx={idx}
                                today={today}
                                weekBookings={bookingsByRowIdx[idx] ?? []}
                                eventTypes={eventTypes}
                                onWeekDateChange={handleWeekDateChange}
                                onBookingClick={setEditingBooking}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Colonna destra: Andamento BIA, Note & obiettivi, Engagement */}
        <div className="flex flex-col gap-6 min-w-0">
          {user?.id && (
            <>
              <TrainerBiaPanel clientId={clientId} coachId={user.id} />
              <CoachNotesCard coachId={user.id} clientId={clientId} />
            </>
          )}

          {/* Engagement — presenza, no-show e frequenza (design handoff) */}
          <section className="bg-surface-container-lowest rounded-[28px] shadow-soft-blue p-6">
            <h2 className="text-xl font-semibold text-on-surface m-0 mb-4">Engagement</h2>
            <div className="flex gap-2">
              <div className="flex-1 text-center">
                <p
                  className="tabular-nums font-display text-2xl font-bold m-0"
                  style={{
                    color: engage.att >= 80 ? "#059669" : engage.att >= 60 ? "#ea580c" : "#dc2626",
                  }}
                >
                  {engage.att}%
                </p>
                <p className="text-[11px] text-outline mt-1 m-0">Presenza</p>
              </div>
              <div className="w-px bg-surface-container-high" />
              <div className="flex-1 text-center">
                <p
                  className="tabular-nums font-display text-2xl font-bold m-0"
                  style={{ color: engage.noshow > 0 ? "#dc2626" : "#191c1f" }}
                >
                  {engage.noshow}
                </p>
                <p className="text-[11px] text-outline mt-1 m-0">No-show</p>
              </div>
              <div className="w-px bg-surface-container-high" />
              <div className="flex-1 text-center">
                <p className="tabular-nums font-display text-2xl font-bold text-on-surface m-0">
                  {engage.perWeek}
                </p>
                <p className="text-[11px] text-outline mt-1 m-0">Sess./sett.</p>
              </div>
            </div>
            <p className="text-xs text-outline text-center mt-4 m-0">
              Ultima sessione: {engage.lastLabel}
            </p>
          </section>
        </div>
      </div>

      <EditBookingDialog
        booking={editingBooking}
        eventTypes={eventTypes.map((e) => ({ id: e.id, name: e.name, base_type: e.base_type }))}
        onClose={() => setEditingBooking(null)}
        onSave={saveBookingEdit}
        onUnlink={(b: EditableBooking) =>
          unlinkBooking(b as ClientBooking, { confirmFirst: false })
        }
        onDeleteEverywhere={(b: EditableBooking) => deleteBookingEverywhere(b as ClientBooking)}
      />

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <AssignPackageDialog
          open={assignOpen}
          clientName={clientName}
          eventTypes={eventTypes.map((e) => ({ id: e.id, name: e.name, base_type: e.base_type }))}
          hasExistingPackage={blocks.length > 0 || hasExtraCredits}
          onAssign={assignPackage}
        />
      </Dialog>

      {/* Suppress unused warning */}
      <span className="hidden">
        {firstName}
        {lastName}
      </span>
    </div>
  );
}
