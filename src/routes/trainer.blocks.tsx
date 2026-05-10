import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Check, Sparkles, Loader2 } from "lucide-react";
import { sessionLabel, SESSION_TYPES, type SessionType } from "@/lib/mock-data";
import { useCoachClients } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/trainer/blocks")({
  component: BlockBuilder,
});

type WeekPlan = Record<SessionType, number>;
const emptyWeek = (): WeekPlan => ({ "PT Session": 0, BIA: 0, "Functional Test": 0 });

function BlockBuilder() {
  const { user } = useAuth();
  const clientsQ = useCoachClients(user?.id);
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [weeks, setWeeks] = useState<[WeekPlan, WeekPlan, WeekPlan, WeekPlan]>([
    emptyWeek(), emptyWeek(), emptyWeek(), emptyWeek(),
  ]);

  const setQty = (w: number, t: SessionType, v: number) => {
    setWeeks((cur) => {
      const copy = [...cur] as typeof cur;
      copy[w] = { ...copy[w], [t]: Math.max(0, v) };
      return copy;
    });
  };

  const totals = SESSION_TYPES.reduce<Record<SessionType, number>>((acc, t) => {
    acc[t] = weeks.reduce((s, w) => s + w[t], 0);
    return acc;
  }, { "PT Session": 0, BIA: 0, "Functional Test": 0 });
  const grand = totals["PT Session"] + totals.BIA + totals["Functional Test"];

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 28);

  const createBlock = useMutation({
    mutationFn: async () => {
      if (!user || !clientId) throw new Error("Cliente non selezionato");
      const { data: block, error } = await supabase
        .from("training_blocks")
        .insert({
          client_id: clientId,
          coach_id: user.id,
          start_date: startDate,
          end_date: endDate.toISOString().slice(0, 10),
          status: "active",
        })
        .select("id")
        .single();
      if (error) throw error;
      const rows: Array<{
        block_id: string;
        week_number: number;
        session_type: SessionType;
        quantity_assigned: number;
      }> = [];
      weeks.forEach((wk, i) => {
        SESSION_TYPES.forEach((t) => {
          if (wk[t] > 0) {
            rows.push({ block_id: block.id, week_number: i + 1, session_type: t, quantity_assigned: wk[t] });
          }
        });
      });
      if (rows.length > 0) {
        const { error: aerr } = await supabase.from("block_allocations").insert(rows);
        if (aerr) throw aerr;
      }
    },
    onSuccess: () => {
      toast.success("Blocco di allenamento creato", { description: `${grand} sessioni in 4 settimane.` });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      setStep(1);
      setClientId("");
      setWeeks([emptyWeek(), emptyWeek(), emptyWeek(), emptyWeek()]);
    },
    onError: (e: unknown) => toast.error("Errore creazione blocco", { description: (e as Error).message }),
  });

  const clients = clientsQ.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Crea blocco</h1>
        <p className="text-sm text-muted-foreground mt-1">Crea un blocco di allenamento di 4 settimane con quote settimanali.</p>
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
              <div className="space-y-2">
                <Label>Data di inizio</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Il blocco termina il {endDate.toLocaleDateString("it-IT", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <CardDescription>Assegna le quote di sessioni per settimana. I valori possono essere zero.</CardDescription>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {weeks.map((w, i) => (
                  <Card key={i} className="border-dashed">
                    <CardHeader>
                      <CardTitle className="text-base">Settimana {i + 1}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {SESSION_TYPES.map((t) => (
                        <div key={t} className="flex items-center justify-between gap-2">
                          <Label className="text-xs font-normal text-muted-foreground">{sessionLabel(t)}</Label>
                          <Input
                            type="number"
                            min={0}
                            className="w-20 text-center"
                            value={w[t]}
                            onChange={(e) => setQty(i, t, parseInt(e.target.value) || 0)}
                          />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 max-w-2xl">
              <div className="rounded-lg border bg-accent/40 p-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <p className="text-sm font-medium">Riepilogo blocco</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {clients.find((c) => c.id === clientId)?.full_name ?? "Cliente"} ·{" "}
                  {new Date(startDate).toLocaleDateString("it-IT")} → {endDate.toLocaleDateString("it-IT")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {SESSION_TYPES.map((t) => (
                    <Badge key={t} variant="secondary">{sessionLabel(t)}: {totals[t]}</Badge>
                  ))}
                  <Badge>Totale: {grand}</Badge>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                {weeks.map((w, i) => (
                  <Card key={i}>
                    <CardHeader><CardTitle className="text-sm">Settimana {i + 1}</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {SESSION_TYPES.map((t) => (
                        <div key={t} className="flex justify-between text-muted-foreground">
                          <span>{sessionLabel(t)}</span><span className="text-foreground tabular-nums">{w[t]}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between border-t pt-4">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
              <ChevronLeft className="size-4" /> Indietro
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={(step === 1 && !clientId) || (step === 2 && grand === 0)}>
                Avanti <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={() => createBlock.mutate()} disabled={createBlock.isPending || grand === 0}>
                {createBlock.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Crea blocco
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Cliente e date", "Quote settimanali", "Riepilogo"];
  return (
    <div className="flex items-center gap-3">
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
