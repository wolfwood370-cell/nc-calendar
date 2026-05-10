import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardDescription } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Check, Sparkles, Loader2 } from "lucide-react";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import { useCoachEventTypes } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

type BlockQuotas = Record<string, number>;

interface Props {
  clientId: string;
  clientName: string;
  onCreated?: () => void;
}

export function BlockAssignmentWizard({ clientId, clientName, onCreated }: Props) {
  const { user } = useAuth();
  const eventTypesQ = useCoachEventTypes(user?.id);
  const qc = useQueryClient();

  const [step, setStep] = useState(1);
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [numBlocks, setNumBlocks] = useState<number>(1);
  const [quotas, setQuotas] = useState<BlockQuotas>({});

  const eventTypes = eventTypesQ.data ?? [];
  const setQty = (id: string, v: number) =>
    setQuotas((cur) => ({ ...cur, [id]: Math.max(0, v) }));

  const blockTotal = useMemo(
    () => Object.values(quotas).reduce((a, b) => a + b, 0),
    [quotas]
  );

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

  const noEventTypes = !eventTypesQ.isLoading && eventTypes.length === 0;

  const createBlocks = useMutation({
    mutationFn: async () => {
      if (!user || !clientId) throw new Error("Cliente non selezionato");
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
          const total = quotas[et.id] ?? 0;
          if (total <= 0) continue;
          rows.push({
            block_id: block.id,
            week_number: 1,
            session_type: et.base_type as SessionType,
            event_type_id: et.id,
            quantity_assigned: total,
          });
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
      setStep(1); setQuotas({}); setNumBlocks(1);
      onCreated?.();
    },
    onError: (e: unknown) => toast.error("Errore creazione blocco", { description: (e as Error).message }),
  });

  return (
    <div className="space-y-5">
      <Stepper step={step} />

      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-md bg-accent/40 p-3 text-sm">
            Cliente: <span className="font-medium">{clientName}</span>
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
        <div className="space-y-4">
          <CardDescription>
            Quante sessioni a settimana per ciascuna tipologia? Le stesse quote saranno applicate a tutti i blocchi creati.
          </CardDescription>
          {eventTypesQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : noEventTypes ? (
            <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                Non hai ancora creato nessuna tipologia di sessione.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/trainer/event-types">Crea tipologie sessione</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-3">
              {eventTypes.map((et) => (
                <div key={et.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
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
        <div className="space-y-4">
          <div className="rounded-lg border bg-accent/40 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <p className="text-sm font-medium">Riepilogo</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {clientName} · {numBlocks} {numBlocks === 1 ? "blocco" : "blocchi"} ·{" "}
              {blockRanges[0].start.toLocaleDateString("it-IT")} → {blockRanges[blockRanges.length - 1].end.toLocaleDateString("it-IT")}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
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

      <div className="flex items-center justify-between border-t pt-4">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
          <ChevronLeft className="size-4" /> Indietro
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={(step === 2 && (noEventTypes || weeklyTotal === 0))}
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
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Date", "Quote settimanali", "Riepilogo"];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`size-6 rounded-full grid place-items-center text-xs font-medium border ${
                active ? "bg-primary text-primary-foreground border-primary"
                : done ? "bg-success text-success-foreground border-success"
                : "bg-card text-muted-foreground"
              }`}
            >
              {done ? <Check className="size-3" /> : n}
            </div>
            <span className={`text-xs ${active ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
            {n < steps.length && <div className="w-6 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}
