import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ChevronLeft, Check } from "lucide-react";
import { availability, getActiveBlock, getCurrentClient, sessionLabel, type SessionType } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/client/book")({
  component: BookFlow,
});

interface Slot {
  iso: string;
  date: Date;
}

function generateSlots(daysAhead: number): Slot[] {
  const slots: Slot[] = [];
  const now = new Date();
  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(now);
    day.setDate(now.getDate() + i);
    const dow = day.getDay();
    const av = availability.find((a) => a.day_of_week === dow);
    if (!av) continue;
    const [sh, sm] = av.start_time.split(":").map(Number);
    const [eh] = av.end_time.split(":").map(Number);
    for (let h = sh; h < eh; h++) {
      const slot = new Date(day);
      slot.setHours(h, sm, 0, 0);
      if (slot.getTime() - now.getTime() < 24 * 60 * 60 * 1000) continue; // regola 24h
      slots.push({ iso: slot.toISOString(), date: slot });
    }
  }
  return slots;
}

function BookFlow() {
  const me = getCurrentClient();
  const block = getActiveBlock(me.id);
  const navigate = useNavigate();
  const [picked, setPicked] = useState<Record<string, SessionType>>({});

  const slots = useMemo(() => generateSlots(28), []);
  const grouped = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = s.date.toDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return m;
  }, [slots]);

  if (!block) {
    return <p className="text-sm text-muted-foreground">Nessun blocco attivo.</p>;
  }

  const remainingByType: Record<SessionType, number> = {
    "PT Session": 0,
    BIA: 0,
    "Functional Test": 0,
  };
  for (const a of block.allocations) {
    remainingByType[a.session_type] += a.quantity_assigned - a.quantity_booked;
  }
  const pickedCounts = Object.values(picked).reduce<Record<SessionType, number>>(
    (acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }),
    { "PT Session": 0, BIA: 0, "Functional Test": 0 }
  );

  const togglePick = (iso: string, type: SessionType | "") => {
    setPicked((cur) => {
      const next = { ...cur };
      if (!type) {
        delete next[iso];
        return next;
      }
      const used = pickedCounts[type] - (cur[iso] === type ? 1 : 0);
      if (used >= remainingByType[type]) {
        toast.error(`Nessuna sessione di tipo ${sessionLabel(type)} rimanente nel tuo blocco.`);
        return cur;
      }
      next[iso] = type;
      return next;
    });
  };

  const totalPicked = Object.keys(picked).length;

  const confirm = () => {
    toast.success(`${totalPicked} ${totalPicked === 1 ? "sessione prenotata" : "sessioni prenotate"}`);
    navigate({ to: "/client" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/client" })}>
          <ChevronLeft className="size-4" /> Indietro
        </Button>
      </div>

      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Prenota il tuo blocco</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Scegli gli slot e assegna un tipo di sessione. Le prenotazioni entro 24 ore sono disabilitate.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          {(Object.keys(remainingByType) as SessionType[]).map((t) => (
            <Badge key={t} variant="outline" className="font-normal">
              {sessionLabel(t)}: <span className="ml-1 tabular-nums font-medium">{remainingByType[t] - pickedCounts[t]}</span> rimanenti
            </Badge>
          ))}
          <div className="ml-auto" />
          <Button onClick={confirm} disabled={totalPicked === 0}>
            <Check className="size-4" /> Conferma {totalPicked > 0 && `(${totalPicked})`}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {[...grouped.entries()].slice(0, 14).map(([day, daySlots]) => (
          <Card key={day}>
            <CardHeader>
              <CardTitle className="text-base">
                {new Date(day).toLocaleDateString("it-IT", { weekday: "long", month: "long", day: "numeric" })}
              </CardTitle>
              <CardDescription>{daySlots.length} slot disponibili</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {daySlots.map((s) => {
                  const chosen = picked[s.iso];
                  return (
                    <div
                      key={s.iso}
                      className={`rounded-lg border p-3 transition ${chosen ? "border-primary bg-primary/5" : "hover:border-primary/40"}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-display font-semibold tabular-nums">
                          {s.date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        {chosen && <Badge>{sessionLabel(chosen)}</Badge>}
                      </div>
                      <Select
                        value={chosen ?? ""}
                        onValueChange={(v) => togglePick(s.iso, v as SessionType | "")}
                      >
                        <SelectTrigger className="mt-2 h-8 text-xs">
                          <SelectValue placeholder="Aggiungi sessione…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PT Session">Sessione PT</SelectItem>
                          <SelectItem value="BIA">BIA</SelectItem>
                          <SelectItem value="Functional Test">Test Funzionale</SelectItem>
                        </SelectContent>
                      </Select>
                      {chosen && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-7 text-xs w-full"
                          onClick={() => togglePick(s.iso, "")}
                        >
                          Rimuovi
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
