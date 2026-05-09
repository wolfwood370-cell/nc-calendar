import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Check, Sparkles } from "lucide-react";
import { clients, type SessionType } from "@/lib/mock-data";
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
    toast.success("Training block created", { description: `${grand} sessions across 4 weeks.` });
    setStep(1);
    setClientId("");
    setWeeks([emptyWeek(), emptyWeek(), emptyWeek(), emptyWeek()]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Block builder</h1>
        <p className="text-sm text-muted-foreground mt-1">Create a 4-week training block with weekly quotas.</p>
      </div>

      <Stepper step={step} />

      <Card>
        <CardContent className="p-6">
          {step === 1 && (
            <div className="space-y-5 max-w-lg">
              <div className="space-y-2">
                <Label>Client</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Block ends {endDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <CardDescription>Assign session quotas per week. Numbers can be zero.</CardDescription>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {weeks.map((w, i) => (
                  <Card key={i} className="border-dashed">
                    <CardHeader>
                      <CardTitle className="text-base">Week {i + 1}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {TYPES.map((t) => (
                        <div key={t} className="flex items-center justify-between gap-2">
                          <Label className="text-xs font-normal text-muted-foreground">{t}</Label>
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
                  <p className="text-sm font-medium">Block summary</p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {clients.find((c) => c.id === clientId)?.full_name ?? "Client"} ·{" "}
                  {new Date(startDate).toLocaleDateString()} → {endDate.toLocaleDateString()}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <Badge key={t} variant="secondary">{t}: {totals[t]}</Badge>
                  ))}
                  <Badge>Total: {grand}</Badge>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                {weeks.map((w, i) => (
                  <Card key={i}>
                    <CardHeader><CardTitle className="text-sm">Week {i + 1}</CardTitle></CardHeader>
                    <CardContent className="space-y-1 text-sm">
                      {TYPES.map((t) => (
                        <div key={t} className="flex justify-between text-muted-foreground">
                          <span>{t}</span><span className="text-foreground tabular-nums">{w[t]}</span>
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
              <ChevronLeft className="size-4" /> Back
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !clientId}>
                Next <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button onClick={finalize}><Check className="size-4" /> Create block</Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Client & dates", "Weekly quotas", "Review"];
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
