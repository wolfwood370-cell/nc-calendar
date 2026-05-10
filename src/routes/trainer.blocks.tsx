import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, Pencil, AlertTriangle, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { sessionLabel } from "@/lib/mock-data";
import {
  useCoachClients, useCoachBlocks, useCoachBookings, useCoachEventTypes,
  type BlockRow, type EventTypeRow,
} from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/trainer/blocks")({
  component: BlocksPage,
});

function BlocksPage() {
  const { user } = useAuth();
  const eventTypesQ = useCoachEventTypes(user?.id);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Blocchi</h1>
        <p className="text-sm text-muted-foreground mt-1">
          I blocchi vengono assegnati direttamente dalla scheda del cliente. Vai su{" "}
          <span className="font-medium">Clienti</span> e usa "Assegna Percorsi/Blocchi".
        </p>
      </div>
      <ActiveBlocksList eventTypes={eventTypesQ.data ?? []} />
    </div>
  );
}

function ActiveBlocksList({ eventTypes }: { eventTypes: EventTypeRow[] }) {
  const { user } = useAuth();
  const blocksQ = useCoachBlocks(user?.id);
  const clientsQ = useCoachClients(user?.id);
  const bookingsQ = useCoachBookings(user?.id);

  const clientName = (id: string) =>
    clientsQ.data?.find((c) => c.id === id)?.full_name ??
    clientsQ.data?.find((c) => c.id === id)?.email ??
    "Cliente";

  const active = (blocksQ.data ?? []).filter((b) => b.status === "active");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Blocchi attivi</CardTitle>
        <CardDescription>Modifica le date di un blocco esistente.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {blocksQ.isLoading ? (
          <div className="p-6"><Skeleton className="h-24 w-full" /></div>
        ) : active.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">Nessun blocco attivo.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Inizio</TableHead>
                <TableHead>Fine</TableHead>
                <TableHead>Sessioni</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {active.map((b) => {
                const total = b.allocations.reduce((s, a) => s + a.quantity_assigned, 0);
                const blockBookings = (bookingsQ.data ?? []).filter((bk) => bk.block_id === b.id);
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{clientName(b.client_id)}</TableCell>
                    <TableCell><Badge variant="outline">{b.sequence_order ?? 1}</Badge></TableCell>
                    <TableCell>{new Date(b.start_date).toLocaleDateString("it-IT")}</TableCell>
                    <TableCell>{new Date(b.end_date).toLocaleDateString("it-IT")}</TableCell>
                    <TableCell><Badge variant="secondary">{total}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <EditBlockDialog block={b} bookingDates={blockBookings.map((x) => x.scheduled_at)} eventTypes={eventTypes} />
                        <DeleteBlockButton blockId={b.id} bookingsCount={blockBookings.length} />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EditBlockDialog({
  block, bookingDates, eventTypes,
}: { block: BlockRow; bookingDates: string[]; eventTypes: EventTypeRow[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(block.start_date);

  const newEnd = (() => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 28);
    return d;
  })();

  const outsideBookings = bookingDates.filter((iso) => {
    const t = new Date(iso).getTime();
    return t < new Date(startDate).getTime() || t > newEnd.getTime();
  }).length;

  const breakdown = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number }>();
    for (const a of block.allocations) {
      const et = eventTypes.find((e) => e.id === a.event_type_id);
      const key = a.event_type_id ?? a.session_type;
      const cur = map.get(key) ?? {
        name: et?.name ?? sessionLabel(a.session_type),
        color: et?.color ?? "#888",
        total: 0,
      };
      cur.total += a.quantity_assigned;
      map.set(key, cur);
    }
    return [...map.values()];
  }, [block.allocations, eventTypes]);

  const update = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("training_blocks")
        .update({ start_date: startDate, end_date: newEnd.toISOString().slice(0, 10) })
        .eq("id", block.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Blocco aggiornato", {
        description: outsideBookings > 0
          ? `${outsideBookings} prenotazioni ora cadono fuori dal blocco.`
          : "Date riallineate correttamente.",
      });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      setOpen(false);
    },
    onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost"><Pencil className="size-4" /> Modifica blocco</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modifica date blocco</DialogTitle>
          <DialogDescription>
            Sposta la data di inizio: la fine si ricalcola automaticamente a 4 settimane.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nuova data di inizio</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="rounded-md bg-accent/40 p-3 text-sm">
            Nuova fine: <span className="font-medium">{newEnd.toLocaleDateString("it-IT")}</span>
          </div>
          {breakdown.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {breakdown.map((b) => (
                <Badge key={b.name} variant="outline" className="font-normal">
                  <span className="size-2 rounded-full mr-1.5" style={{ backgroundColor: b.color }} />
                  {b.name}: {b.total}
                </Badge>
              ))}
            </div>
          )}
          {outsideBookings > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
              <p>
                Attenzione: {outsideBookings} prenotazion{outsideBookings === 1 ? "e cadrà" : "i cadranno"} fuori dalle nuove date del blocco.
                Le prenotazioni esistenti restano comunque valide.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => update.mutate()} disabled={update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />} Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
