import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer/availability")({
  component: AvailabilityPage,
});

interface AvailabilityRow {
  id: string;
  coach_id: string;
  day_of_week: number;
  start_time: string; // "HH:MM:SS"
  end_time: string;
}

const DAYS = [
  { dow: 1, label: "Lunedì" },
  { dow: 2, label: "Martedì" },
  { dow: 3, label: "Mercoledì" },
  { dow: 4, label: "Giovedì" },
  { dow: 5, label: "Venerdì" },
  { dow: 6, label: "Sabato" },
  { dow: 7, label: "Domenica" },
];

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

function fmt(t: string) {
  return t.slice(0, 5);
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

  const addMut = useMutation({
    mutationFn: async (input: { day_of_week: number; start_time: string; end_time: string }) => {
      const { error } = await supabase.from("trainer_availability").insert({
        coach_id: meId!,
        day_of_week: input.day_of_week,
        start_time: input.start_time,
        end_time: input.end_time,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fascia oraria aggiunta");
      qc.invalidateQueries({ queryKey: ["trainer_availability", meId] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trainer_availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Fascia oraria rimossa");
      qc.invalidateQueries({ queryKey: ["trainer_availability", meId] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Disponibilità</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configura il tuo orario settimanale tipo. I clienti potranno prenotare solo all'interno di queste fasce.
        </p>
      </div>

      {availQ.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {DAYS.map((d) => {
            const rows = (availQ.data ?? []).filter((r) => r.day_of_week === d.dow);
            return (
              <DayCard
                key={d.dow}
                label={d.label}
                rows={rows}
                onAdd={(start, end) => addMut.mutate({ day_of_week: d.dow, start_time: start, end_time: end })}
                onDelete={(id) => delMut.mutate(id)}
                adding={addMut.isPending}
                deleting={delMut.isPending}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function DayCard({
  label, rows, onAdd, onDelete, adding, deleting,
}: {
  label: string;
  rows: AvailabilityRow[];
  onAdd: (start: string, end: string) => void;
  onDelete: (id: string) => void;
  adding: boolean;
  deleting: boolean;
}) {
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");

  const handleAdd = () => {
    if (end <= start) {
      toast.error("L'ora di fine deve essere successiva a quella di inizio");
      return;
    }
    onAdd(`${start}:00`, `${end}:00`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>
          {rows.length === 0 ? "Nessuna fascia configurata" : `${rows.length} ${rows.length === 1 ? "fascia" : "fasce"}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <Badge variant="outline" className="font-mono tabular-nums">
                    {fmt(r.start_time)} – {fmt(r.end_time)}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onDelete(r.id)}
                  disabled={deleting}
                  aria-label="Rimuovi fascia"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 pt-2 border-t">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Inizio</label>
            <Select value={start} onValueChange={setStart}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Fine</label>
            <Select value={end} onValueChange={setEnd}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOURS.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={adding}>
            {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Aggiungi
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
