import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, CalendarOff, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCoachAvailabilityExceptions, type AvailabilityExceptionRow } from "@/lib/queries";
import { HOURS, fmt } from "@/lib/availability-helpers";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface AvailabilityExceptionsCardProps {
  /** ID del coach. Se undefined la mutation INSERT viene bloccata upstream. */
  coachId?: string;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Card "Ferie ed Eccezioni" per la pagina disponibilità coach:
 *   - Calendar single-select per la data dell'eccezione
 *   - RadioGroup mode: "full" (tutto il giorno) vs "range" (fascia oraria)
 *   - Select start/end (visibili solo se mode=range)
 *   - Input motivo (opzionale)
 *   - Lista eccezioni esistenti con bottone Trash per rimozione
 *
 * Tutte le mutation gestite localmente via useMutation con toast +
 * invalidazione query `availability_exceptions`.
 *
 * Estratto da trainer.availability.tsx (era function inline).
 */
export function AvailabilityExceptionsCard({ coachId }: AvailabilityExceptionsCardProps) {
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
      if (mode === "range" && end <= start)
        throw new Error("L'ora di fine deve essere successiva a quella di inizio");
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
        <Label className="flex items-center gap-2 rounded-full border bg-surface px-3 py-2 cursor-pointer text-sm">
          <RadioGroupItem value="full" /> Tutto il giorno
        </Label>
        <Label className="flex items-center gap-2 rounded-full border bg-surface px-3 py-2 cursor-pointer text-sm">
          <RadioGroupItem value="range" /> Fascia oraria
        </Label>
      </RadioGroup>

      {mode === "range" && (
        <div className="flex items-center gap-2 mb-3">
          <Select value={start} onValueChange={setStart}>
            <SelectTrigger className="h-10 rounded-full bg-surface border-surface-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={h}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-outline-variant">—</span>
          <Select value={end} onValueChange={setEnd}>
            <SelectTrigger className="h-10 rounded-full bg-surface border-surface-variant">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={h}>
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Input
        placeholder="Motivo (es. Ferie)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="mb-3 h-10 rounded-full bg-surface border-surface-variant px-4"
      />

      <Button
        onClick={() => addMut.mutate()}
        disabled={addMut.isPending || !date}
        className="w-full rounded-full h-11"
      >
        {addMut.isPending ? (
          <Loader2 className="size-4 animate-spin mr-2" />
        ) : (
          <Plus className="size-4 mr-2" />
        )}
        Aggiungi eccezione
      </Button>

      <div className="mt-5 space-y-2">
        {exQ.isLoading && <Skeleton className="h-14 w-full rounded-[24px]" />}
        {!exQ.isLoading && exceptions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nessuna eccezione configurata.</p>
        )}
        {exceptions.map((ex) => {
          const fullDay = !ex.start_time || !ex.end_time;
          const d = new Date(ex.date + "T00:00:00");
          return (
            <div
              key={ex.id}
              className="flex items-center justify-between rounded-[24px] bg-surface p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <CalendarOff className="size-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {d.toLocaleDateString("it-IT", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
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
