import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Loader2,
  MapPin,
  Video,
  Dumbbell,
  Check,
  AlertCircle,
} from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/lib/query-keys";
import { errorMessage } from "@/lib/utils";
import type { SessionType } from "@/lib/mock-data";
import { toast } from "sonner";
import { GCAL_COLORS, GCAL_DEFAULT, nameForColor } from "@/lib/event-colors";
import { EventTypeServiceCard } from "@/components/event-type-service-card";

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
  location_address: z.string().trim().max(255).optional().or(z.literal("")),
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
  location_address: string | null;
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
        .select(
          "id, coach_id, name, description, color, duration, base_type, location_type, buffer_minutes, location_address",
        )
        .eq("coach_id", coachId!)
        .order("name", { ascending: true });
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
            name: input.name,
            description: input.description || null,
            color: input.color,
            duration: input.duration,
            location_type: input.location_type,
            buffer_minutes: input.buffer_minutes,
            location_address:
              input.location_type === "physical" ? input.location_address || null : null,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("event_types").insert({
          coach_id: coachId,
          name: input.name,
          description: input.description || null,
          color: input.color,
          duration: input.duration,
          location_type: input.location_type,
          buffer_minutes: input.buffer_minutes,
          location_address:
            input.location_type === "physical" ? input.location_address || null : null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Tipologia aggiornata" : "Tipologia creata");
      qc.invalidateQueries({ queryKey: queryKeys.eventTypes.coach(coachId) });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: unknown) => toast.error("Errore", { description: errorMessage(e) }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("event_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipologia eliminata");
      qc.invalidateQueries({ queryKey: queryKeys.eventTypes.coach(coachId) });
    },
    onError: (e: unknown) => toast.error("Errore", { description: errorMessage(e) }),
  });

  const types = listQ.data ?? [];

  return (
    <div className="min-h-screen bg-surface -m-4 md:-m-6 p-6 md:p-10 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight text-primary">
            I tuoi Servizi
          </h1>
          <p className="text-base text-muted-foreground mt-2">
            Gestisci le tipologie di sessione e la loro durata.
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => setEditing(null)}
              className="rounded-full px-6 py-3 shadow-sm self-start md:self-auto"
            >
              <Plus className="size-4" /> Nuova Tipologia
            </Button>
          </DialogTrigger>
          <EventTypeDialog
            key={editing?.id ?? "new"}
            initial={editing}
            onSubmit={(values) => upsert.mutate({ ...values, id: editing?.id })}
            submitting={upsert.isPending}
          />
        </Dialog>
      </div>

      {listQ.isLoading ? (
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-[32px]" />
          ))}
        </div>
      ) : listQ.isError ? (
        <div className="rounded-[32px] bg-white p-12 text-center shadow-sm space-y-4">
          <AlertCircle className="size-10 mx-auto text-destructive" />
          <p className="text-sm text-foreground font-semibold">
            Errore nel caricamento delle tipologie.
          </p>
          <Button variant="outline" onClick={() => listQ.refetch()} className="rounded-full">
            Riprova
          </Button>
        </div>
      ) : types.length === 0 ? (
        <div className="rounded-[32px] bg-white p-16 text-center shadow-[0px_4px_20px_rgba(0,86,133,0.05)] space-y-5">
          <div className="size-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Dumbbell className="size-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-foreground">Nessun servizio configurato</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Non hai ancora configurato i tuoi servizi. Inizia creando una nuova tipologia di
              sessione.
            </p>
          </div>
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="rounded-full px-6"
          >
            <Plus className="size-4" /> Nuova Tipologia
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
          {types.map((t) => (
            <EventTypeServiceCard
              key={t.id}
              type={t}
              onEdit={() => {
                setEditing(t);
                setOpen(true);
              }}
              onDelete={() => remove.mutate(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}


function EventTypeDialog({
  initial,
  onSubmit,
  submitting,
}: {
  initial: EventTypeRow | null;
  onSubmit: (v: z.infer<typeof schema>) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? GCAL_DEFAULT);
  const [duration, setDuration] = useState<number>(initial?.duration ?? 60);
  const [locationType, setLocationType] = useState<"physical" | "online">(
    initial?.location_type ?? "physical",
  );
  const [bufferMinutes, setBufferMinutes] = useState<number>(initial?.buffer_minutes ?? 0);
  const [locationAddress, setLocationAddress] = useState<string>(initial?.location_address ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      name,
      description,
      color,
      duration,
      location_type: locationType,
      buffer_minutes: bufferMinutes,
      location_address: locationAddress,
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
        <DialogTitle>{initial ? "Modifica tipologia" : "Nuova tipologia di sessione"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required />
        </div>
        <div className="space-y-2">
          <Label>Descrizione</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={280}
            rows={2}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Durata (minuti)</Label>
            <Input
              type="number"
              min={15}
              max={240}
              step={5}
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
            />
          </div>
          <div className="space-y-2">
            <Label>Margine di tempo dopo la sessione (minuti)</Label>
            <Input
              type="number"
              min={0}
              max={240}
              step={5}
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
            <Label
              htmlFor="loc-physical"
              className="flex items-center gap-2 rounded-[16px] border p-3 cursor-pointer hover:bg-accent/50"
            >
              <RadioGroupItem value="physical" id="loc-physical" />
              <MapPin className="size-4" /> In studio
            </Label>
            <Label
              htmlFor="loc-online"
              className="flex items-center gap-2 rounded-[16px] border p-3 cursor-pointer hover:bg-accent/50"
            >
              <RadioGroupItem value="online" id="loc-online" />
              <Video className="size-4" /> Online
            </Label>
          </RadioGroup>
        </div>
        {locationType === "physical" && (
          <div className="space-y-2">
            <Label>Indirizzo (per Google Maps)</Label>
            <Input
              value={locationAddress}
              onChange={(e) => setLocationAddress(e.target.value)}
              placeholder="Es. Via Roma 1, Milano"
              maxLength={255}
            />
            <p className="text-xs text-muted-foreground">
              I clienti potranno aprire l'indirizzo direttamente in Google Maps.
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label>Colore (palette Google Calendar)</Label>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-11">
            {GCAL_COLORS.map((c) => {
              const selected = color.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                  aria-label={c.name}
                  className={`size-8 rounded-full border-2 transition flex items-center justify-center text-white ${selected ? "border-foreground scale-110 ring-2 ring-offset-2 ring-offset-background ring-foreground/20" : "border-transparent hover:scale-105"}`}
                  style={{ backgroundColor: c.hex }}
                >
                  {selected && <Check className="size-4 drop-shadow" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Selezionato: <span className="font-medium">{nameForColor(color) ?? color}</span>
          </p>
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
