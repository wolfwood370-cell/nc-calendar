import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Check, Sparkles, Loader2, Pencil, AlertTriangle } from "lucide-react";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import {
  useCoachClients, useCoachBlocks, useCoachBookings, useCoachEventTypes,
  type BlockRow, type EventTypeRow,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/trainer/blocks")({
  component: BlockBuilder,
});

// quote settimanali per ciascun event_type → quantità per settimana (intero)
type WeeklyQuotas = Record<string, number>; // eventTypeId -> weekly count

function BlockBuilder() {
  const { user } = useAuth();
  const clientsQ = useCoachClients(user?.id);
  const eventTypesQ = useCoachEventTypes(user?.id);
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [numBlocks, setNumBlocks] = useState<number>(1);
  const [quotas, setQuotas] = useState<WeeklyQuotas>({});

  const eventTypes = eventTypesQ.data ?? [];
  const clients = clientsQ.data ?? [];

  const setQty = (id: string, v: number) =>
    setQuotas((cur) => ({ ...cur, [id]: Math.max(0, v) }));

  const weeklyTotal = useMemo(
    () => Object.values(quotas).reduce((a, b) => a + b, 0),
    [quotas]
  );
  const blockTotal = weeklyTotal * 4;

  const blockRanges = useMemo(() => {
    const out: { idx: number; start: Date; end: Date }[] = [];
    const base = new Date(startDate);
    for (let i = 0; i < numBlocks; i++) {
      const s = new Date(base); s.setDate(base.getDate() + i * 28);
      const e = new Date(s); e.setDate(s.getDate() + 28);
      out.push({ idx: i + 1, start: s, end: e });
    }
    return out;
  }, [startDate, numBlocks]);

  const createBlocks = useMutation({
    mutationFn: async () => {
      if (!user || !clientId) throw new Error("Cliente non selezionato");
      // determina sequence_order di partenza dal massimo esistente per il cliente
      const { data: maxRow } = await supabase
        .from("training_blocks")
        .select("sequence_order")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("sequence_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const startSeq = (maxRow?.sequence_order ?? 0) + 1;

      for (let i = 0; i < blockRanges.length; i++) {
        const r = blockRanges[i];
        const { data: block, error } = await supabase
          .from("training_blocks")
          .insert({
            client_id: clientId,
            coach_id: user.id,
            start_date: r.start.toISOString().slice(0, 10),
            end_date: r.end.toISOString().slice(0, 10),
            status: "active",
            sequence_order: startSeq + i,
          })
          .select("id")
          .single();
        if (error) throw error;

        const rows: Array<{
          block_id: string;
          week_number: number;
          session_type: SessionType;
          event_type_id: string;
          quantity_assigned: number;
        }> = [];
        for (const et of eventTypes) {
          const weekly = quotas[et.id] ?? 0;
          if (weekly <= 0) continue;
          for (let wn = 1; wn <= 4; wn++) {
            rows.push({
              block_id: block.id,
              week_number: wn,
              session_type: et.base_type,
              event_type_id: et.id,
              quantity_assigned: weekly,
            });
          }
        }
        if (rows.length > 0) {
          const { error: aerr } = await supabase.from("block_allocations").insert(rows);
          if (aerr) throw aerr;
        }
      }
    },
    onSuccess: () => {
      toast.success(
        numBlocks === 1 ? "Blocco creato" : `${numBlocks} blocchi sequenziali creati`,
        { description: `${blockTotal} sessioni per blocco · ${blockTotal * numBlocks} totali.` }
      );
      qc.invalidateQueries({ queryKey: ["blocks"] });
      setStep(1);
      setClientId("");
      setQuotas({});
      setNumBlocks(1);
    },
    onError: (e: unknown) => toast.error("Errore creazione blocco", { description: (e as Error).message }),
  });

  const noEventTypes = !eventTypesQ.isLoading && eventTypes.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Crea blocco</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Definisci le quote settimanali per tipologia di sessione e genera uno o più blocchi sequenziali da 4 settimane.
        </p>
      </div>

      <Stepper step={step} />

      <Card>
        <CardContent className="p-6">
          {step === 1 && (
            <div className="space-y-5 max-w-lg">
              <div className="space-y-2">
                <Label>Cliente</Label>
                {clientsQ.isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger><SelectValue placeholder="Seleziona un cliente" /></SelectTrigger>
                    <SelectContent>
                      {clients.length === 0 && (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Nessun cliente. Invitane uno prima.</div>
                      )}
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name ?? c.email ?? "Cliente"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data di inizio (Blocco 1)</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Numero di Blocchi</Label>
                  <Input
                    type="number" min={1} max={12}
                    value={numBlocks}
                    onChange={(e) => setNumBlocks(Math.min(12, Math.max(1, parseInt(e.target.value) || 1)))}
                  />
                  <p className="text-xs text-muted-foreground">Ciascun blocco dura 4 settimane.</p>
                </div>
              </div>
              <div className="rounded-md bg-accent/40 p-3 text-sm space-y-1">
                {blockRanges.map((r) => (
                  <p key={r.idx} className="text-muted-foreground">
                    Blocco {r.idx}: <span className="text-foreground font-medium">
                      {r.start.toLocaleDateString("it-IT")} → {r.end.toLocaleDateString("it-IT")}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <CardDescription>
                Quante sessioni a settimana per ciascuna tipologia? Le stesse quote saranno applicate a tutti i blocchi creati.
              </CardDescription>
              {eventTypesQ.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : noEventTypes ? (
                <div className="rounded-lg border border-dashed p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Non hai ancora creato nessuna tipologia di sessione.
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/trainer/event-types">Crea tipologie sessione</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {eventTypes.map((et) => (
                    <div key={et.id} className="flex items-center justify-between gap-3 rounded-lg border p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: et.color }} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{et.name}</p>
                          <p className="text-xs text-muted-foreground">{et.duration} min · {sessionLabel(et.base_type)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min={0}
                          className="w-20 text-center"
                          value={quotas[et.id] ?? 0}
                          onChange={(e) => setQty(et.id, parseInt(e.target.value) || 0)}
                        />
                        <span className="text-xs text-muted-foreground">/ sett.</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!noEventTypes && (
                <div className="rounded-md bg-accent/40 p-3 text-sm">
                  Totale per blocco: <span className="font-medium tabular-nums">{blockTotal}</span> sessioni
                  {numBlocks > 1 && (
                    <> · Totale {numBlocks} blocchi: <span className="font-medium tabular-nums">{blockTotal * numBlocks}</span></>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 max-w-2xl">
              <div className="rounded-lg border bg-accent/40 p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <p className="text-sm font-medium">Riepilogo</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {clients.find((c) => c.id === clientId)?.full_name ?? "Cliente"} ·{" "}
                  {numBlocks} {numBlocks === 1 ? "blocco" : "blocchi"} ·{" "}
                  {blockRanges[0].start.toLocaleDateString("it-IT")} → {blockRanges[blockRanges.length - 1].end.toLocaleDateString("it-IT")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {eventTypes.map((et) => {
                    const w = quotas[et.id] ?? 0;
                    if (w === 0) return null;
                    return (
                      <Badge key={et.id} variant="secondary" style={{ borderColor: et.color }}>
                        <span className="size-2 rounded-full mr-1.5" style={{ backgroundColor: et.color }} />
                        {et.name}: {w * 4}/blocco
                      </Badge>
                    );
                  })}
                  <Badge>Totale: {blockTotal * numBlocks}</Badge>
                </div>
              </div>
              <div className="grid gap-2">
                {blockRanges.map((r) => (
                  <div key={r.idx} className="flex items-center justify-between rounded-md border p-3 text-sm">
                    <span className="font-medium">Blocco {r.idx}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {r.start.toLocaleDateString("it-IT")} → {r.end.toLocaleDateString("it-IT")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              <ChevronLeft className="size-4" /> Indietro
            </Button>
            {step < 3 ? (
              <Button
                onClick={() => setStep((s) => s + 1)}
                disabled={(step === 1 && !clientId) || (step === 2 && (noEventTypes || weeklyTotal === 0))}
              >
                Avanti <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={() => createBlocks.mutate()} disabled={createBlocks.isPending || weeklyTotal === 0}>
                {createBlocks.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Crea {numBlocks === 1 ? "blocco" : `${numBlocks} blocchi`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <ActiveBlocksList eventTypes={eventTypes} />
    </div>
  );
}

function ActiveBlocksList({ eventTypes }: { eventTypes: EventTypeRow[] }) {
  const { user } = useAuth();
  const blocksQ = useCoachBlocks(user?.id);
  const clientsQ = useCoachClients(user?.id);
  const bookingsQ = useCoachBookings(user?.id);

  const clientName = (id: string) =>
    clientsQ.data?.find((c) => c.id === id)?.full_name ??
    clientsQ.data?.find((c) => c.id === id)?.email ??
    "Cliente";

  const active = (blocksQ.data ?? []).filter((b) => b.status === "active");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Blocchi attivi</CardTitle>
        <CardDescription>Modifica le date di un blocco esistente.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {blocksQ.isLoading ? (
          <div className="p-6"><Skeleton className="h-24 w-full" /></div>
        ) : active.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">Nessun blocco attivo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Inizio</TableHead>
                <TableHead>Fine</TableHead>
                <TableHead>Sessioni</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((b) => {
                const total = b.allocations.reduce((s, a) => s + a.quantity_assigned, 0);
                const blockBookings = (bookingsQ.data ?? []).filter((bk) => bk.block_id === b.id);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{clientName(b.client_id)}</TableCell>
                    <TableCell><Badge variant="outline">{b.sequence_order ?? 1}</Badge></TableCell>
                    <TableCell>{new Date(b.start_date).toLocaleDateString("it-IT")}</TableCell>
                    <TableCell>{new Date(b.end_date).toLocaleDateString("it-IT")}</TableCell>
                    <TableCell><Badge variant="secondary">{total}</Badge></TableCell>
                    <TableCell className="text-right">
                      <EditBlockDialog block={b} bookingDates={blockBookings.map((x) => x.scheduled_at)} eventTypes={eventTypes} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EditBlockDialog({
  block, bookingDates, eventTypes,
}: { block: BlockRow; bookingDates: string[]; eventTypes: EventTypeRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(block.start_date);

  const newEnd = (() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 28);
    return d;
  })();

  const outsideBookings = bookingDates.filter((iso) => {
    const t = new Date(iso).getTime();
    return t < new Date(startDate).getTime() || t > newEnd.getTime();
  }).length;

  const breakdown = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number }>();
    for (const a of block.allocations) {
      const et = eventTypes.find((e) => e.id === a.event_type_id);
      const key = a.event_type_id ?? a.session_type;
      const cur = map.get(key) ?? {
        name: et?.name ?? sessionLabel(a.session_type),
        color: et?.color ?? "#888",
        total: 0,
      };
      cur.total += a.quantity_assigned;
      map.set(key, cur);
    }
    return [...map.values()];
  }, [block.allocations, eventTypes]);

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("training_blocks")
        .update({ start_date: startDate, end_date: newEnd.toISOString().slice(0, 10) })
        .eq("id", block.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Blocco aggiornato", {
        description: outsideBookings > 0
          ? `${outsideBookings} prenotazioni ora cadono fuori dal blocco.`
          : "Date riallineate correttamente.",
      });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      setOpen(false);
    },
    onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Pencil className="size-4" /> Modifica blocco</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica date blocco</DialogTitle>
          <DialogDescription>
            Sposta la data di inizio: la fine si ricalcola automaticamente a 4 settimane.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nuova data di inizio</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="rounded-md bg-accent/40 p-3 text-sm">
            Nuova fine: <span className="font-medium">{newEnd.toLocaleDateString("it-IT")}</span>
          </div>
          {breakdown.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {breakdown.map((b) => (
                <Badge key={b.name} variant="outline" className="font-normal">
                  <span className="size-2 rounded-full mr-1.5" style={{ backgroundColor: b.color }} />
                  {b.name}: {b.total}
                </Badge>
              ))}
            </div>
          )}
          {outsideBookings > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <p>
                Attenzione: {outsideBookings} prenotazion{outsideBookings === 1 ? "e cadrà" : "i cadranno"} fuori dalle nuove date del blocco.
                Le prenotazioni esistenti restano comunque valide.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />} Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Cliente e blocchi", "Quote settimanali", "Riepilogo"];
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-3">
            <div
              className={`size-7 rounded-full grid place-items-center text-xs font-medium border ${
                active ? "bg-primary text-primary-foreground border-primary"
                : done ? "bg-success text-success-foreground border-success"
                : "bg-card text-muted-foreground"
              }`}
            >
              {done ? <Check className="size-3.5" /> : n}
            </div>
            <span className={`text-sm ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
            {n < steps.length && <div className="w-10 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
