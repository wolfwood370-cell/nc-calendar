import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2, MapPin, Video } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import type { SessionType } from "@/lib/mock-data";
import { toast } from "sonner";
import { GCAL_COLORS, GCAL_DEFAULT, nameForColor } from "@/lib/event-colors";

export const Route = createFileRoute("/trainer/event-types")({
  component: EventTypesPage,
});

const schema = z.object({
  name: z.string().trim().min(1, "Nome obbligatorio").max(60),
  description: z.string().trim().max(280).optional().or(z.literal("")),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido"),
  duration: z.number().int().min(15).max(240),
  location_type: z.enum(["physical", "online"]),
  buffer_minutes: z.number().int().min(0).max(240),
});

export interface EventTypeRow {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  color: string;
  duration: number;
  base_type: SessionType;
  location_type: "physical" | "online";
  buffer_minutes: number;
}

function EventTypesPage() {
  const { user } = useAuth();
  const coachId = user?.id;
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["event_types", coachId],
    enabled: !!coachId,
    queryFn: async (): Promise<EventTypeRow[]> => {
      const { data, error } = await supabase
        .from("event_types")
        .select("id, coach_id, name, description, color, duration, base_type, location_type, buffer_minutes")
        .eq("coach_id", coachId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as EventTypeRow[];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventTypeRow | null>(null);

  const upsert = useMutation({
    mutationFn: async (input: z.infer<typeof schema> & { id?: string }) => {
      if (!coachId) throw new Error("Coach non autenticato");
      if (input.id) {
        const { error } = await supabase
          .from("event_types")
          .update({
            name: input.name, description: input.description || null,
            color: input.color, duration: input.duration,
            location_type: input.location_type, buffer_minutes: input.buffer_minutes,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_types").insert({
          coach_id: coachId, name: input.name,
          description: input.description || null, color: input.color,
          duration: input.duration,
          location_type: input.location_type, buffer_minutes: input.buffer_minutes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tipologia aggiornata" : "Tipologia creata");
      qc.invalidateQueries({ queryKey: ["event_types"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipologia eliminata");
      qc.invalidateQueries({ queryKey: ["event_types"] });
    },
    onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
  });

  const types = listQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Tipologie evento</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Personalizza nome, colore e durata delle sessioni offerte ai tuoi clienti.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing(null)}><Plus className="size-4" /> Nuova tipologia</Button>
          </DialogTrigger>
          <EventTypeDialog
            initial={editing}
            onSubmit={(values) => upsert.mutate({ ...values, id: editing?.id })}
            submitting={upsert.isPending}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipologie configurate</CardTitle>
          <CardDescription>
            Se non ne configuri nessuna, verranno usate le categorie predefinite (Sessione PT, BIA, Test Funzionale).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : types.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nessuna tipologia personalizzata. Aggiungine una per iniziare.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {types.map((t) => (
                <div key={t.id} className="rounded-lg border p-4 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div
                      className="size-10 rounded-md border shrink-0"
                      style={{ backgroundColor: t.color }}
                      aria-label={`Colore ${t.color}`}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{t.name}</p>
                        <Badge variant="outline" className="text-xs">{t.duration} min</Badge>
                        <Badge variant="secondary" className="text-xs inline-flex items-center gap-1">
                          {t.location_type === "online" ? <Video className="size-3" /> : <MapPin className="size-3" />}
                          {t.location_type === "online" ? "Online" : "Fisico"}
                        </Badge>
                        {t.buffer_minutes > 0 && (
                          <Badge variant="outline" className="text-xs">+{t.buffer_minutes}m margine</Badge>
                        )}
                      </div>
                      {t.description && (
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                      <Pencil className="size-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost"><Trash2 className="size-4" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Eliminare la tipologia?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{t.name}" verrà rimossa. Le prenotazioni esistenti non saranno modificate.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annulla</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(t.id)}>Elimina</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EventTypeDialog({
  initial, onSubmit, submitting,
}: {
  initial: EventTypeRow | null;
  onSubmit: (v: z.infer<typeof schema>) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? GCAL_DEFAULT);
  const [duration, setDuration] = useState<number>(initial?.duration ?? 60);
  const [locationType, setLocationType] = useState<"physical" | "online">(initial?.location_type ?? "physical");
  const [bufferMinutes, setBufferMinutes] = useState<number>(initial?.buffer_minutes ?? 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      name, description, color, duration,
      location_type: locationType, buffer_minutes: bufferMinutes,
    });
    if (!parsed.success) {
      toast.error("Dati non validi", { description: parsed.error.issues[0]?.message });
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{initial ? "Modifica tipologia" : "Nuova tipologia evento"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </div>
        <div className="space-y-2">
          <Label>Descrizione</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={280} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Durata (minuti)</Label>
            <Input
              type="number" min={15} max={240} step={5}
              value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
            />
          </div>
          <div className="space-y-2">
            <Label>Margine di tempo dopo la sessione (minuti)</Label>
            <Input
              type="number" min={0} max={240} step={5}
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Luogo della Sessione</Label>
          <RadioGroup
            value={locationType}
            onValueChange={(v) => setLocationType(v as "physical" | "online")}
            className="grid grid-cols-2 gap-2"
          >
            <Label htmlFor="loc-physical" className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent/50">
              <RadioGroupItem value="physical" id="loc-physical" />
              <MapPin className="size-4" /> Fisico
            </Label>
            <Label htmlFor="loc-online" className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent/50">
              <RadioGroupItem value="online" id="loc-online" />
              <Video className="size-4" /> Online
            </Label>
          </RadioGroup>
        </div>
        <div className="space-y-2">
          <Label>Colore</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-8 rounded-md border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
            <Input
              type="text" value={color} onChange={(e) => setColor(e.target.value)}
              className="w-28 font-mono text-xs" placeholder="#3b82f6"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {initial ? "Salva modifiche" : "Crea tipologia"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
