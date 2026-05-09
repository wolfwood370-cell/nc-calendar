import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Check, Sparkles } from "lucide-react";
import { clients, sessionLabel, type SessionType } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer/blocks")({
  component: BlockBuilder,
});

const TYPES: SessionType[] = ["PT Session", "BIA", "Functional Test"];

type WeekPlan = Record<SessionType, number>;
const emptyWeek = (): WeekPlan => ({ "PT Session": 0, BIA: 0, "Functional Test": 0 });

function BlockBuilder() {
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

  const totals = TYPES.reduce<Record<SessionType, number>>((acc, t) => {
    acc[t] = weeks.reduce((s, w) => s + w[t], 0);
    return acc;
  }, { "PT Session": 0, BIA: 0, "Functional Test": 0 });
  const grand = totals["PT Session"] + totals.BIA + totals["Functional Test"];

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 28);

  const finalize = () => {
    toast.success("Blocco di allenamento creato", { description: `${grand} sessioni in 4 settimane.` });
    setStep(1);
    setClientId("");
    setWeeks([emptyWeek(), emptyWeek(), emptyWeek(), emptyWeek()]);
  };

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
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona un cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
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
                      {TYPES.map((t) => (
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
                  {TYPES.map((t) => (
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
                      {TYPES.map((t) => (
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
              <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !clientId}>
                Avanti <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={finalize}><Check className="size-4" /> Crea blocco</Button>
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
