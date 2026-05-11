import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Plus, Trash2, Copy, Loader2, CalendarOff, Info, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { useCoachAvailabilityExceptions, type AvailabilityExceptionRow } from "@/lib/queries";

export const Route = createFileRoute("/trainer/availability")({
  component: AvailabilityPage,
});

interface AvailabilityRow {
  id: string;
  coach_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface TimeBlock {
  start: string;
  end: string;
}

interface DayState {
  active: boolean;
  blocks: TimeBlock[];
}

const DAYS: { dow: number; label: string; short: string }[] = [
  { dow: 1, label: "Lunedì", short: "Lun" },
  { dow: 2, label: "Martedì", short: "Mar" },
  { dow: 3, label: "Mercoledì", short: "Mer" },
  { dow: 4, label: "Giovedì", short: "Gio" },
  { dow: 5, label: "Venerdì", short: "Ven" },
  { dow: 6, label: "Sabato", short: "Sab" },
  { dow: 7, label: "Domenica", short: "Dom" },
];

const HOURS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

function fmt(t: string) {
  return t.slice(0, 5);
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function emptyWeek(): Record<number, DayState> {
  const w: Record<number, DayState> = {};
  for (const d of DAYS) w[d.dow] = { active: false, blocks: [] };
  return w;
}

function AvailabilityPage() {
  const { user } = useAuth();
  const meId = user?.id;
  const qc = useQueryClient();

  const availQ = useQuery({
    queryKey: ["trainer_availability", meId],
    enabled: !!meId,
    queryFn: async (): Promise<AvailabilityRow[]> => {
      const { data, error } = await supabase
        .from("trainer_availability")
        .select("id, coach_id, day_of_week, start_time, end_time")
        .eq("coach_id", meId!)
        .order("day_of_week", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AvailabilityRow[];
    },
  });

  const settingsQ = useQuery({
    queryKey: ["trainer_settings", meId],
    enabled: !!meId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trainer_settings")
        .select("buffer_minutes, min_notice_hours, booking_horizon_days")
        .eq("coach_id", meId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const [week, setWeek] = useState<Record<number, DayState>>(emptyWeek());
  const [bufferMin, setBufferMin] = useState(15);
  const [minNotice, setMinNotice] = useState(24);
  const [horizon, setHorizon] = useState(60);

  // Hydrate week state when data arrives
  useEffect(() => {
    if (!availQ.data) return;
    const w = emptyWeek();
    for (const r of availQ.data) {
      const d = w[r.day_of_week];
      if (!d) continue;
      d.active = true;
      d.blocks.push({ start: fmt(r.start_time), end: fmt(r.end_time) });
    }
    setWeek(w);
  }, [availQ.data]);

  useEffect(() => {
    if (!settingsQ.data) return;
    setBufferMin(settingsQ.data.buffer_minutes);
    setMinNotice(settingsQ.data.min_notice_hours);
    setHorizon(settingsQ.data.booking_horizon_days);
  }, [settingsQ.data]);

  const toggleDay = (dow: number, active: boolean) => {
    setWeek((prev) => ({
      ...prev,
      [dow]: {
        active,
        blocks: active && prev[dow].blocks.length === 0 ? [{ start: "09:00", end: "13:00" }] : prev[dow].blocks,
      },
    }));
  };

  const updateBlock = (dow: number, idx: number, field: "start" | "end", value: string) => {
    setWeek((prev) => {
      const blocks = prev[dow].blocks.map((b, i) => (i === idx ? { ...b, [field]: value } : b));
      return { ...prev, [dow]: { ...prev[dow], blocks } };
    });
  };

  const addBlock = (dow: number) => {
    setWeek((prev) => ({
      ...prev,
      [dow]: { ...prev[dow], blocks: [...prev[dow].blocks, { start: "14:00", end: "18:00" }] },
    }));
  };

  const removeBlock = (dow: number, idx: number) => {
    setWeek((prev) => {
      const blocks = prev[dow].blocks.filter((_, i) => i !== idx);
      return { ...prev, [dow]: { ...prev[dow], blocks } };
    });
  };

  const copyToAll = (sourceDow: number) => {
    setWeek((prev) => {
      const src = prev[sourceDow].blocks.map((b) => ({ ...b }));
      const next = { ...prev };
      for (const d of DAYS) {
        if (d.dow === sourceDow) continue;
        if (next[d.dow].active) {
          next[d.dow] = { ...next[d.dow], blocks: src.map((b) => ({ ...b })) };
        }
      }
      return next;
    });
    toast.success("Orari copiati sui giorni attivi");
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!meId) throw new Error("Non autenticato");

      // Validate
      const rows: { coach_id: string; day_of_week: number; start_time: string; end_time: string }[] = [];
      for (const d of DAYS) {
        const ds = week[d.dow];
        if (!ds.active) continue;
        for (const b of ds.blocks) {
          if (!b.start || !b.end) continue;
          if (b.end <= b.start) {
            throw new Error(`${d.label}: l'ora di fine deve essere successiva a quella di inizio`);
          }
          rows.push({
            coach_id: meId,
            day_of_week: d.dow,
            start_time: `${b.start}:00`,
            end_time: `${b.end}:00`,
          });
        }
      }

      // Replace all availability rows for this coach
      const del = await supabase.from("trainer_availability").delete().eq("coach_id", meId);
      if (del.error) throw del.error;
      if (rows.length > 0) {
        const ins = await supabase.from("trainer_availability").insert(rows);
        if (ins.error) throw ins.error;
      }

      // Upsert settings
      const up = await supabase
        .from("trainer_settings")
        .upsert(
          {
            coach_id: meId,
            buffer_minutes: bufferMin,
            min_notice_hours: minNotice,
            booking_horizon_days: horizon,
          },
          { onConflict: "coach_id" },
        );
      if (up.error) throw up.error;
    },
    onSuccess: () => {
      toast.success("Modifiche salvate");
      qc.invalidateQueries({ queryKey: ["trainer_availability", meId] });
      qc.invalidateQueries({ queryKey: ["trainer_settings", meId] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const loading = availQ.isLoading || settingsQ.isLoading;

  return (
    <div className="min-h-screen bg-[#f8f9fe] -m-4 sm:-m-6 p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Disponibilità</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configura il tuo orario settimanale, le regole di prenotazione e le eccezioni.
            </p>
          </div>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending || loading}
            className="rounded-full px-6 h-11"
          >
            {saveMut.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : <Save className="size-4 mr-2" />}
            Salva Modifiche
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* LEFT: Weekly Schedule */}
          <div className="space-y-6">
            <div className="rounded-[24px] bg-blue-50/70 border border-blue-100 p-4 flex items-start gap-3">
              <Info className="size-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900">Sincronizzato con Google Calendar</p>
                <p className="text-blue-700/80 mt-0.5">
                  Le tue disponibilità verranno automaticamente confrontate con gli eventi del tuo calendario per evitare doppie prenotazioni.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-[32px] shadow-[0px_4px_20px_rgba(0,86,133,0.05)] p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold mb-1">Orario Settimanale</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Definisci gli intervalli in cui sei disponibile per le sessioni.
              </p>

              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-2xl" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {DAYS.map((d, dayIdx) => {
                    const ds = week[d.dow];
                    return (
                      <div key={d.dow} className="py-4 flex flex-col sm:flex-row sm:items-start gap-4">
                        <div className="flex items-center gap-3 sm:w-40 shrink-0 pt-2">
                          <Switch
                            checked={ds.active}
                            onCheckedChange={(v) => toggleDay(d.dow, v)}
                            aria-label={`Attiva ${d.label}`}
                          />
                          <span className={`font-medium ${ds.active ? "text-slate-900" : "text-slate-400"}`}>
                            {d.label}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          {!ds.active ? (
                            <p className="text-sm text-slate-400 italic pt-2">Non disponibile</p>
                          ) : (
                            <div className="space-y-2">
                              {ds.blocks.map((b, idx) => (
                                <div key={idx} className="flex items-center gap-2 flex-wrap">
                                  <Select value={b.start} onValueChange={(v) => updateBlock(d.dow, idx, "start", v)}>
                                    <SelectTrigger className="h-10 w-[110px] rounded-full bg-slate-50 border-slate-200">
                                      <SelectValue placeholder="--:--" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  <span className="text-slate-400">—</span>
                                  <Select value={b.end} onValueChange={(v) => updateBlock(d.dow, idx, "end", v)}>
                                    <SelectTrigger className="h-10 w-[110px] rounded-full bg-slate-50 border-slate-200">
                                      <SelectValue placeholder="--:--" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-full text-slate-400 hover:text-red-500"
                                    onClick={() => removeBlock(d.dow, idx)}
                                    aria-label="Rimuovi fascia"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 sm:pt-1">
                          {ds.active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-slate-500 hover:bg-slate-100"
                              onClick={() => addBlock(d.dow)}
                              aria-label="Aggiungi fascia"
                            >
                              <Plus className="size-4" />
                            </Button>
                          )}
                          {dayIdx === 0 && ds.active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-slate-500 hover:bg-slate-100"
                              onClick={() => copyToAll(d.dow)}
                              aria-label="Copia su tutti i giorni"
                              title="Copia su tutti i giorni attivi"
                            >
                              <Copy className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Booking rules + exceptions */}
          <div className="space-y-6">
            <div className="bg-white rounded-[32px] shadow-[0px_4px_20px_rgba(0,86,133,0.05)] p-6 sm:p-8">
              <h2 className="font-display text-xl font-semibold mb-1">Regole di Prenotazione</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Imposta i vincoli che i tuoi clienti devono rispettare.
              </p>

              <div className="space-y-5">
                <div>
                  <Label className="text-sm font-medium">Buffer tra sessioni (minuti)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={bufferMin}
                    onChange={(e) => setBufferMin(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-2 h-11 rounded-full bg-slate-50 border-slate-200 px-5"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Preavviso minimo (ore)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={minNotice}
                    onChange={(e) => setMinNotice(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-2 h-11 rounded-full bg-slate-50 border-slate-200 px-5"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Orizzonte di prenotazione (giorni)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={horizon}
                    onChange={(e) => setHorizon(Math.max(1, Number(e.target.value) || 1))}
                    className="mt-2 h-11 rounded-full bg-slate-50 border-slate-200 px-5"
                  />
                </div>
              </div>
            </div>

            <ExceptionsCard coachId={meId} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ExceptionsCard({ coachId }: { coachId?: string }) {
  const qc = useQueryClient();
  const exQ = useCoachAvailabilityExceptions(coachId);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [mode, setMode] = useState<"full" | "range">("full");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");
  const [reason, setReason] = useState("");

  const addMut = useMutation({
    mutationFn: async () => {
      if (!date) throw new Error("Seleziona una data");
      if (mode === "range" && end <= start) throw new Error("L'ora di fine deve essere successiva a quella di inizio");
      const { error } = await supabase.from("availability_exceptions").insert({
        coach_id: coachId!,
        date: toDateKey(date),
        reason: reason.trim(),
        start_time: mode === "range" ? `${start}:00` : null,
        end_time: mode === "range" ? `${end}:00` : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eccezione aggiunta");
      setReason("");
      qc.invalidateQueries({ queryKey: ["availability_exceptions", coachId] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability_exceptions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Eccezione rimossa");
      qc.invalidateQueries({ queryKey: ["availability_exceptions", coachId] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const exceptions = useMemo(() => (exQ.data ?? []) as AvailabilityExceptionRow[], [exQ.data]);

  return (
    <div className="bg-white rounded-[32px] shadow-[0px_4px_20px_rgba(0,86,133,0.05)] p-6 sm:p-8">
      <h2 className="font-display text-xl font-semibold mb-1">Ferie ed Eccezioni</h2>
      <p className="text-sm text-muted-foreground mb-4">Blocca giornate o fasce specifiche.</p>

      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        className="p-0 pointer-events-auto mb-4"
      />

      <RadioGroup
        value={mode}
        onValueChange={(v) => setMode(v as "full" | "range")}
        className="grid grid-cols-2 gap-2 mb-3"
      >
        <Label className="flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-2 cursor-pointer text-sm">
          <RadioGroupItem value="full" /> Tutto il giorno
        </Label>
        <Label className="flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-2 cursor-pointer text-sm">
          <RadioGroupItem value="range" /> Fascia oraria
        </Label>
      </RadioGroup>

      {mode === "range" && (
        <div className="flex items-center gap-2 mb-3">
          <Select value={start} onValueChange={setStart}>
            <SelectTrigger className="h-10 rounded-full bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-slate-400">—</span>
          <Select value={end} onValueChange={setEnd}>
            <SelectTrigger className="h-10 rounded-full bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent>{HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      <Input
        placeholder="Motivo (es. Ferie)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mb-3 h-10 rounded-full bg-slate-50 border-slate-200 px-4"
      />

      <Button
        onClick={() => addMut.mutate()}
        disabled={addMut.isPending || !date}
        className="w-full rounded-full h-11"
      >
        {addMut.isPending ? <Loader2 className="size-4 animate-spin mr-2" /> : <Plus className="size-4 mr-2" />}
        Aggiungi eccezione
      </Button>

      <div className="mt-5 space-y-2">
        {exQ.isLoading && <Skeleton className="h-14 w-full rounded-2xl" />}
        {!exQ.isLoading && exceptions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nessuna eccezione configurata.</p>
        )}
        {exceptions.map((ex) => {
          const fullDay = !ex.start_time || !ex.end_time;
          const d = new Date(ex.date + "T00:00:00");
          return (
            <div key={ex.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <CalendarOff className="size-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {fullDay ? "Tutto il giorno" : `${fmt(ex.start_time!)} – ${fmt(ex.end_time!)}`}
                    {ex.reason ? ` · ${ex.reason}` : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-8 w-8 shrink-0"
                onClick={() => delMut.mutate(ex.id)}
                disabled={delMut.isPending}
                aria-label="Rimuovi eccezione"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
