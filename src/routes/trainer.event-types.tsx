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
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { sessionLabel, SESSION_TYPES, type SessionType } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer/event-types")({
  component: EventTypesPage,
});

const COLOR_PRESETS = [
  "#3b82f6", "#22c55e", "#ef4444", "#f59e0b",
  "#8b5cf6", "#ec4899", "#14b8a6", "#0ea5e9",
  "#a855f7", "#64748b",
];

const schema = z.object({
  name: z.string().trim().min(1, "Nome obbligatorio").max(60),
  description: z.string().trim().max(280).optional().or(z.literal("")),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido"),
  duration: z.number().int().min(15).max(240),
  base_type: z.enum(["PT Session", "BIA", "Functional Test"]),
});

export interface EventTypeRow {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  color: string;
  duration: number;
  base_type: SessionType;
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
            color: input.color, duration: input.duration, base_type: input.base_type,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_types").insert({
          coach_id: coachId, name: input.name,
          description: input.description || null, color: input.color,
          duration: input.duration, base_type: input.base_type,
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
                        <Badge variant="secondary" className="text-xs">{sessionLabel(t.base_type)}</Badge>
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
  const [color, setColor] = useState(initial?.color ?? COLOR_PRESETS[0]);
  const [duration, setDuration] = useState<number>(initial?.duration ?? 60);
  const [baseType, setBaseType] = useState<SessionType>(initial?.base_type ?? "PT Session");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ name, description, color, duration, base_type: baseType });
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
            <Label>Tipologia Sessione</Label>
            <Select value={baseType} onValueChange={(v) => setBaseType(v as SessionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SESSION_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{sessionLabel(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
