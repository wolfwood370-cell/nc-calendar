import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, CalendarIcon, Loader2, Save, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
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
  monday_date: string; // YYYY-MM-DD
  shifted: boolean;
}

function toIso(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function nextMonday(d: Date): Date {
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 1 ? 0 : (8 - day) % 7 || 7;
  return addDays(startOfDay(d), diff);
}

function isMonday(d: Date) {
  return d.getDay() === 1;
}

function ClientPathPage() {
  const { id: clientId } = useParams({ from: "/trainer/clients/$id" });
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState<string>("");
  const [pathStart, setPathStart] = useState<Date | undefined>(undefined);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [rows, setRows] = useState<WeekRow[]>([]);
  const [originalRows, setOriginalRows] = useState<WeekRow[]>([]);

  const totalWeeks = totalBlocks * WEEKS_PER_BLOCK;

  useEffect(() => {
    if (!clientId || !user) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, user?.id]);

  async function load() {
    setLoading(true);

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, email, path_start_date")
      .eq("id", clientId)
      .maybeSingle();
    setClientName(profile?.full_name ?? profile?.email ?? "Cliente");
    setPathStart(profile?.path_start_date ? parseISO(profile.path_start_date as string) : undefined);

    const { data: blocks } = await supabase
      .from("training_blocks")
      .select("id, sequence_order")
      .eq("client_id", clientId)
      .is("deleted_at", null);
    const blocksCount = (blocks ?? []).length;
    setTotalBlocks(blocksCount);

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

    const totalW = blocksCount * WEEKS_PER_BLOCK;
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
    setLoading(false);
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
    // Cascade: shift all subsequent weeks by +7 days each
    for (let i = weekIndex + 1; i < updated.length; i++) {
      updated[i] = {
        ...updated[i],
        monday_date: toIso(addDays(monday, (i - weekIndex) * 7)),
        // Preserve manual shifts only on the changed row; downstream becomes recalculated
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
      // Update profile start date
      const { error: pErr } = await supabase
        .from("profiles")
        .update({ path_start_date: toIso(pathStart) })
        .eq("id", clientId);
      if (pErr) throw pErr;

      // Replace weekly schedule
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

  // Group rows by block for visual tinting
  const blockTints = ["bg-muted/30", "bg-primary/5", "bg-accent/30", "bg-secondary/40"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/trainer/clients"><ArrowLeft className="size-4" /></Link>
          </Button>
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">
              {clientName}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pianificazione Calendario Percorso
            </p>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendario Settimanale</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 grid place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : totalBlocks === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nessun blocco assegnato a questo cliente. Assegna prima i blocchi dalla pagina Clienti.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Settimana</TableHead>
                  <TableHead className="w-[120px]">Blocco</TableHead>
                  <TableHead>Data (Lunedì)</TableHead>
                  <TableHead className="text-right">Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => {
                  const date = r.monday_date ? parseISO(r.monday_date) : null;
                  const isPast = date ? isBefore(date, today) : false;
                  const tint = blockTints[(r.block_number - 1) % blockTints.length];
                  const isFirstOfBlock = idx === 0 || rows[idx - 1].block_number !== r.block_number;
                  return (
                    <TableRow
                      key={r.week_number}
                      className={cn(
                        tint,
                        isPast && "opacity-60",
                        isFirstOfBlock && "border-t-2 border-t-primary/30",
                      )}
                    >
                      <TableCell className="font-medium">N° {r.week_number}</TableCell>
                      <TableCell>
                        <Badge variant="outline">Blocco {r.block_number}</Badge>
                      </TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "h-8 px-2 font-normal",
                                r.shifted && "text-warning font-medium",
                              )}
                            >
                              <CalendarIcon className="size-3.5" />
                              {date ? format(date, "EEE dd MMM yyyy", { locale: it }) : "—"}
                            </Button>
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
                      </TableCell>
                      <TableCell className="text-right">
                        {isPast ? (
                          <Badge variant="secondary">Completata</Badge>
                        ) : r.shifted ? (
                          <Badge className="bg-warning/15 text-warning border-warning/30" variant="outline">
                            Spostata
                          </Badge>
                        ) : (
                          <Badge variant="outline">Pianificata</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
