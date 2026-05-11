import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronLeft, ChevronRight, UserSearch, MessageCircle, HelpCircle, Calendar as CalendarIcon } from "lucide-react";
import { sessionLabel } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import { useCoachBookings, useCoachClients, useCoachEventTypes, type BookingRow } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { syncCalendarAwait } from "@/lib/sync-calendar";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer/calendar")({
  component: CalendarPage,
});

const SOFT_SHADOW = "shadow-[0px_4px_20px_rgba(0,86,133,0.05)]";
const HOUR_HEIGHT = 64; // px
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 Sun ... 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function fmtRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} - ${end.getDate()} ${start.toLocaleDateString("it-IT", { month: "long" })}`;
  }
  return `${start.toLocaleDateString("it-IT", opts)} - ${end.toLocaleDateString("it-IT", opts)}`;
}

function CalendarPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [mirroring, setMirroring] = useState(false);
  const lastMirrorMonth = useRef<string>("");

  const bookingsQ = useCoachBookings(user?.id);
  const clientsQ = useCoachClients(user?.id);
  const eventTypesQ = useCoachEventTypes(user?.id);

  const bookings = bookingsQ.data ?? [];
  const clients = clientsQ.data ?? [];
  const eventTypes = eventTypesQ.data ?? [];

  const clientsMap = useMemo(() => {
    const m = new Map<string, (typeof clients)[number]>();
    clients.forEach((c) => m.set(c.id, c));
    return m;
  }, [clients]);
  const eventTypesMap = useMemo(() => {
    const m = new Map<string, (typeof eventTypes)[number]>();
    eventTypes.forEach((e) => m.set(e.id, e));
    return m;
  }, [eventTypes]);

  // ----- Focus Cliente -----
  const [focusClientId, setFocusClientId] = useState<string | null>(null);
  const focusClient = focusClientId ? clientsMap.get(focusClientId) ?? null : null;

  const lastNoteQ = useQuery({
    queryKey: ["last-note", focusClientId],
    enabled: !!focusClientId,
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("scheduled_at, trainer_notes")
        .eq("client_id", focusClientId!)
        .not("trainer_notes", "is", null)
        .lte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { scheduled_at: string; trainer_notes: string } | null;
    },
  });

  // ----- Assign dialog -----
  const [assignTarget, setAssignTarget] = useState<BookingRow | null>(null);
  const [assignClientId, setAssignClientId] = useState<string>("");
  const assignBooking = useMutation({
    mutationFn: async (input: { bookingId: string; clientId: string }) => {
      const { error } = await supabase
        .from("bookings")
        .update({ client_id: input.clientId })
        .eq("id", input.bookingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sessione assegnata");
      setAssignTarget(null);
      setAssignClientId("");
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  // ----- Week navigation -----
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = weekDays[6];

  const bookingsByDay = useMemo(() => {
    const map: BookingRow[][] = Array.from({ length: 7 }, () => []);
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const d = new Date(b.scheduled_at);
      for (let i = 0; i < 7; i++) {
        if (sameDay(d, weekDays[i])) {
          map[i].push(b);
          break;
        }
      }
    }
    return map;
  }, [bookings, weekDays]);

  // ----- Sync flows (preserved from previous impl) -----
  const didFullSync = useRef(false);
  useEffect(() => {
    if (!user || didFullSync.current) return;
    didFullSync.current = true;
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    setMirroring(true);
    syncCalendarAwait({
      action: "import_history", coachId: user.id,
      rangeStartISO: "2026-01-01T00:00:00Z",
      rangeEndISO: future.toISOString(),
    })
      .then(({ data }) => {
        const r = data as { ok?: boolean; imported?: number; updated?: number; creditsBooked?: number; skipped?: boolean } | null;
        if (r?.skipped) return;
        if (r?.ok) {
          toast.success("Sincronizzazione completata", {
            description: `${r.imported ?? 0} nuovi · ${r.updated ?? 0} aggiornati · ${r.creditsBooked ?? 0} crediti scalati`,
          });
          qc.invalidateQueries({ queryKey: ["bookings"] });
          qc.invalidateQueries({ queryKey: ["block-allocations"] });
        }
      })
      .catch((e) => console.error("full sync failed", e))
      .finally(() => setMirroring(false));
  }, [user, qc]);

  useEffect(() => {
    if (!user) return;
    const monthKey = `${weekStart.getFullYear()}-${weekStart.getMonth()}`;
    if (lastMirrorMonth.current === monthKey) return;
    lastMirrorMonth.current = monthKey;
    const start = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1).toISOString();
    const end = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0, 23, 59, 59).toISOString();
    setMirroring(true);
    syncCalendarAwait({
      action: "mirror_check", coachId: user.id,
      rangeStartISO: start, rangeEndISO: end,
    })
      .then(({ data }) => {
        const r = data as { ok?: boolean; cancelled?: number; moved?: number; remapped?: number; imported?: number } | null;
        if (r?.ok && ((r.cancelled ?? 0) > 0 || (r.moved ?? 0) > 0 || (r.remapped ?? 0) > 0 || (r.imported ?? 0) > 0)) {
          toast.info("Calendario aggiornato");
          qc.invalidateQueries({ queryKey: ["bookings"] });
        }
      })
      .catch((e) => console.error("mirror_check failed", e))
      .finally(() => setMirroring(false));
  }, [user, weekStart, qc]);

  // ----- Render helpers -----
  const renderEvent = (b: BookingRow) => {
    const d = new Date(b.scheduled_at);
    const hour = d.getHours() + d.getMinutes() / 60;
    if (hour < START_HOUR || hour >= END_HOUR) return null;

    const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
    const duration = et?.duration ?? 60;
    const top = (hour - START_HOUR) * HOUR_HEIGHT;
    const height = Math.max(28, (duration / 60) * HOUR_HEIGHT - 4);

    const isUnassigned = !b.client_id; // To Review
    const isExternal = !!b.client_id && b.client_id === b.coach_id; // Sync senza match
    const client = b.client_id && !isExternal ? clientsMap.get(b.client_id) : undefined;
    const typeLabel = et?.name ?? sessionLabel(b.session_type);
    const timeLabel = `${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })} - ${new Date(d.getTime() + duration * 60000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;

    if (isUnassigned) {
      return (
        <button
          key={b.id}
          onClick={() => { setAssignTarget(b); setAssignClientId(""); }}
          style={{ top, height }}
          className="absolute left-1 right-1 z-10 border-2 border-dashed border-[#ffb77b] bg-[#ffdcc2]/40 rounded-2xl p-2 flex flex-col items-center justify-center gap-1 text-[#5b2f00] hover:bg-[#ffdcc2]/70 hover:scale-[1.02] transition-all cursor-pointer"
        >
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <HelpCircle className="size-3.5 animate-pulse" /> Assegna
          </div>
          <div className="text-[10px] opacity-80">{timeLabel}</div>
        </button>
      );
    }

    if (isExternal) {
      const title = (b.notes ?? "").replace(/^Importato da Google Calendar:\s*/i, "") || b.title || "Evento esterno";
      return (
        <div
          key={b.id}
          style={{ top, height }}
          className="absolute left-1 right-1 z-10 bg-[#f2f3f8] border border-[#c1c7d0]/40 rounded-2xl p-2 cursor-default hover:bg-[#eceef2] transition-colors"
        >
          <h4 className="text-[12px] leading-tight font-medium text-[#41474f] truncate">{title}</h4>
          <p className="text-[10px] text-[#717880] mt-0.5">{timeLabel}</p>
        </div>
      );
    }

    // Certified
    return (
      <button
        key={b.id}
        onClick={() => setFocusClientId(b.client_id)}
        style={{ top, height }}
        className="absolute left-1 right-1 z-10 bg-[#cde5ff] border-l-4 border-[#003e62] rounded-2xl p-2 flex flex-col justify-between text-left shadow-sm hover:shadow-md hover:scale-[1.02] transition-all cursor-pointer"
      >
        <div>
          <h4 className="text-[12px] leading-tight font-semibold text-[#001d32] truncate">
            {client?.full_name ?? "Cliente"} — {typeLabel}
          </h4>
          <p className="text-[10px] text-[#004b74] mt-0.5">{timeLabel}</p>
        </div>
      </button>
    );
  };

  const today = new Date();

  return (
    <div className="-m-6 flex flex-col xl:flex-row min-h-[calc(100vh-3.5rem)] bg-[#f8f9fe]">
      {/* MAIN */}
      <section className="flex-1 flex flex-col min-w-0 p-6">
        {/* Header */}
        <header className="flex flex-col gap-4 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h1 className="font-display text-2xl font-bold text-[#003e62]">Calendario Master</h1>
            {mirroring && (
              <div className="flex items-center gap-2 text-xs text-[#717880] rounded-full border border-[#c1c7d0] px-3 py-1.5 bg-white">
                <Loader2 className="size-3.5 animate-spin" /> Sincronizzazione…
              </div>
            )}
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekStart(startOfWeek(new Date()))}
                className="rounded-full bg-white border-[#e1e2e7]"
              >
                Oggi
              </Button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setWeekStart(addDays(weekStart, -7))}
                  className="size-8 rounded-full hover:bg-[#eceef2] flex items-center justify-center text-[#41474f]"
                  aria-label="Settimana precedente"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm font-semibold min-w-[160px] text-center capitalize">
                  {fmtRange(weekStart, weekEnd)}
                </span>
                <button
                  onClick={() => setWeekStart(addDays(weekStart, 7))}
                  className="size-8 rounded-full hover:bg-[#eceef2] flex items-center justify-center text-[#41474f]"
                  aria-label="Settimana successiva"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Grid */}
        <div className={`flex-1 bg-white rounded-[32px] ${SOFT_SHADOW} border border-[#eceef2] overflow-hidden flex flex-col`}>
          {/* Days header */}
          <div className="flex border-b border-[#eceef2] bg-[#f8f9fe] sticky top-0 z-20">
            <div className="w-16 shrink-0 border-r border-[#eceef2]" />
            <div className="flex-1 grid grid-cols-7">
              {weekDays.map((d, i) => {
                const isToday = sameDay(d, today);
                return (
                  <div
                    key={i}
                    className={`p-3 text-center border-r border-[#eceef2] last:border-r-0 ${isToday ? "bg-[#cde5ff]/30" : ""}`}
                  >
                    <div className={`text-[11px] uppercase tracking-wider ${isToday ? "text-[#003e62] font-bold" : "text-[#717880]"}`}>
                      {DAY_LABELS[i]}
                    </div>
                    <div className={`text-xl mt-1 ${isToday ? "text-[#003e62] font-bold" : "font-semibold"}`}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Time grid */}
          <div className="flex-1 overflow-y-auto">
            <div className="flex relative" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
              {/* Hours */}
              <div className="w-16 shrink-0 border-r border-[#eceef2] bg-[#f8f9fe]">
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ height: HOUR_HEIGHT }}
                    className="border-b border-[#eceef2] flex items-start justify-center pt-1 text-[11px] text-[#717880]"
                  >
                    {String(h).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {/* Day columns */}
              <div className="flex-1 grid grid-cols-7 relative">
                {weekDays.map((d, i) => {
                  const isToday = sameDay(d, today);
                  return (
                    <div
                      key={i}
                      className={`relative border-r border-[#eceef2]/60 last:border-r-0 ${isToday ? "bg-[#cde5ff]/10" : ""}`}
                      style={{ height: HOURS.length * HOUR_HEIGHT }}
                    >
                      {/* hour grid lines */}
                      {HOURS.map((h) => (
                        <div
                          key={h}
                          style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                          className="absolute left-0 right-0 border-b border-[#eceef2]"
                        />
                      ))}
                      {bookingsByDay[i].map((b) => renderEvent(b))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTEXT PANEL */}
      <aside className="hidden xl:flex flex-col w-80 border-l border-[#e1e2e7] bg-[#f8f9fe] sticky top-0 h-screen">
        <div className="p-6 border-b border-[#e1e2e7] bg-white/50 backdrop-blur-md">
          <h3 className="text-lg font-bold text-[#003e62] flex items-center gap-2">
            <UserSearch className="size-5" /> Focus Cliente
          </h3>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {!focusClient && (
            <div className={`bg-white rounded-[24px] p-6 ${SOFT_SHADOW} border border-[#f2f3f8] text-center text-sm text-[#717880]`}>
              <CalendarIcon className="size-10 mx-auto mb-3 text-[#c1c7d0]" />
              Seleziona una sessione confermata per vedere il dettaglio cliente.
            </div>
          )}

          {focusClient && (
            <>
              <div className={`bg-white rounded-[24px] p-6 ${SOFT_SHADOW} border border-[#f2f3f8] flex flex-col items-center text-center`}>
                <div className="size-20 rounded-full bg-[#cde5ff] text-[#003e62] flex items-center justify-center text-2xl font-bold border-4 border-[#f8f9fe] mb-3 shadow-sm">
                  {(focusClient.full_name ?? "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("")}
                </div>
                <h4 className="text-lg font-bold text-[#191c1f]">{focusClient.full_name ?? "Cliente"}</h4>
                <p className="text-sm text-[#41474f] mb-4">{focusClient.email ?? ""}</p>
                <a
                  href={`/trainer/clients/${focusClient.id}`}
                  className="w-full bg-[#f2f3f8] text-[#191c1f] text-sm font-semibold py-2 rounded-2xl hover:bg-[#eceef2] transition-colors"
                >
                  Profilo Completo
                </a>
              </div>

              <div className={`bg-white rounded-[24px] p-4 ${SOFT_SHADOW} border border-[#f2f3f8]`}>
                {focusClient.phone ? (
                  <a
                    href={`https://wa.me/${focusClient.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full bg-[#25D366]/10 text-[#075E54] border border-[#25D366]/30 text-sm font-semibold py-3 rounded-2xl flex items-center justify-center gap-2 hover:bg-[#25D366]/20 transition-colors"
                  >
                    <MessageCircle className="size-4" /> Messaggio WhatsApp
                  </a>
                ) : (
                  <div className="text-xs text-[#717880] text-center py-2">Numero di telefono non disponibile.</div>
                )}
              </div>

              <div className={`bg-white rounded-[24px] p-5 ${SOFT_SHADOW} border border-[#f2f3f8]`}>
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-[11px] uppercase tracking-wider font-bold text-[#191c1f]">Note Ultima Sessione</h5>
                  {lastNoteQ.data?.scheduled_at && (
                    <span className="text-[11px] text-[#717880]">
                      {new Date(lastNoteQ.data.scheduled_at).toLocaleDateString("it-IT", { day: "2-digit", month: "long" })}
                    </span>
                  )}
                </div>
                <div className="bg-[#f8f9fe] p-4 rounded-2xl">
                  {lastNoteQ.isLoading ? (
                    <p className="text-sm text-[#717880]">Caricamento…</p>
                  ) : lastNoteQ.data?.trainer_notes ? (
                    <p className="text-sm text-[#41474f] italic leading-relaxed">"{lastNoteQ.data.trainer_notes}"</p>
                  ) : (
                    <p className="text-sm text-[#717880] italic">Nessuna nota disponibile.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </aside>

      {/* Assign Dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assegna evento a un cliente</DialogTitle>
            <DialogDescription>
              {assignTarget && new Date(assignTarget.scheduled_at).toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" })}
              {assignTarget?.title ? ` · ${assignTarget.title}` : ""}
            </DialogDescription>
          </DialogHeader>
          <Select value={assignClientId} onValueChange={setAssignClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleziona cliente…" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.full_name ?? c.email ?? "Cliente"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignTarget(null)}>Annulla</Button>
            <Button
              disabled={!assignClientId || assignBooking.isPending}
              onClick={() => assignTarget && assignBooking.mutate({ bookingId: assignTarget.id, clientId: assignClientId })}
            >
              {assignBooking.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Assegna
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
