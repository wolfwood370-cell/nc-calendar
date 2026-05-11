import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Loader2, Mail, X, Archive, CalendarPlus, PlusCircle, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { sendInvitationEmail } from "@/lib/email";
import { BlockAssignmentWizard } from "@/components/block-assignment-wizard";
import { CsvImportClients } from "@/components/csv-import-clients";
import { useClientBlocks, useCoachBookings } from "@/lib/queries";
import { DeleteBlockButton } from "@/routes/trainer.blocks";
import { Separator } from "@/components/ui/separator";
import { useQueryClient } from "@tanstack/react-query";
import { sessionLabel } from "@/lib/mock-data";

export const Route = createFileRoute("/trainer/clients")({
  component: ClientsPage,
});

interface ClientRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}
interface InvitationRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}

function ClientsPage() {
  const { user, role } = useAuth();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const isAdmin = role === "admin";

  async function load() {
    setLoading(true);
    let cq = supabase
      .from("profiles")
      .select("id, full_name, email, phone")
      .is("deleted_at", null);
    if (!isAdmin && user) cq = cq.eq("coach_id", user.id);
    const { data: cs } = await cq;
    setClients((cs as ClientRow[]) ?? []);

    let iq = supabase.from("client_invitations")
      .select("id, email, full_name, phone, status, created_at")
      .order("created_at", { ascending: false });
    if (!isAdmin && user) iq = iq.eq("coach_id", user.id);
    const { data: invs } = await iq;
    setInvitations((invs as InvitationRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filtered = clients.filter((c) =>
    (c.full_name ?? "").toLowerCase().includes(q.toLowerCase()) ||
    (c.email ?? "").toLowerCase().includes(q.toLowerCase())
  );

  const pending = invitations.filter((i) => i.status === "pending");

  async function inviteClient(data: { name: string; email: string; phone: string }) {
    if (!user) return;
    const { error } = await supabase.from("client_invitations").insert({
      email: data.email.toLowerCase().trim(),
      full_name: data.name,
      phone: data.phone || null,
      coach_id: user.id,
    });
    if (error) {
      toast.error("Invito non riuscito", { description: error.message });
      return;
    }
    const coachName = (user.user_metadata?.full_name as string) || user.email || "il tuo Coach";
    await sendInvitationEmail({ to: data.email, clientName: data.name, coachName });
    toast.success("Invito creato", {
      description: `Email di invito inviata a ${data.email}.`,
    });
    setOpen(false);
    load();
  }

  async function cancelInvite(id: string) {
    const { error } = await supabase
      .from("client_invitations")
      .update({ status: "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("Errore", { description: error.message });
      return;
    }
    toast.success("Invito annullato");
    load();
  }

  async function archiveClient(id: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast.error("Errore", { description: error.message });
      return;
    }
    toast.success("Cliente archiviato", {
      description: "I dati storici restano disponibili.",
    });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Clienti</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invita nuovi clienti e gestisci il roster.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {user && (
            <CsvImportClients
              coachId={user.id}
              coachName={(user.user_metadata?.full_name as string) || user.email || "il tuo Coach"}
              onDone={load}
            />
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4" /> Invita cliente</Button>
            </DialogTrigger>
            <InviteClientDialog onSubmit={inviteClient} />
          </Dialog>
        </div>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4" /> Inviti in attesa ({pending.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{i.email}</TableCell>
                    <TableCell className="text-muted-foreground">{i.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">In attesa</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => cancelInvite(i.id)}>
                        <X className="size-4" /> Annulla
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 border-b p-4">
            <Search className="size-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cerca clienti…"
              className="border-0 shadow-none focus-visible:ring-0 px-0"
            />
          </div>
          {loading ? (
            <div className="p-8 grid place-items-center text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefono</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      Nessun cliente registrato. Invia un invito per iniziare.
                    </TableCell>
                  </TableRow>
                ) : filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.full_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-success/10 text-success border-success/20">Attivo</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <AssignBlocksSheet clientId={c.id} clientName={c.full_name ?? c.email ?? "Cliente"} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                              <Archive className="size-4" /> Archivia
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Sei sicuro di voler eliminare questo cliente?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Il cliente {c.full_name ?? c.email} verrà archiviato. I dati storici (blocchi, prenotazioni)
                                restano conservati nel sistema e non saranno persi.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => archiveClient(c.id)}>
                                Archivia
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InviteClientDialog({ onSubmit }: { onSubmit: (d: { name: string; email: string; phone: string }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Invita un nuovo cliente</DialogTitle>
      </DialogHeader>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ name, email, phone });
        }}
      >
        <div className="space-y-2">
          <Label>Nome completo</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <p className="text-xs text-muted-foreground">
            Il cliente potrà registrarsi con questa email e verrà collegato automaticamente a te.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Telefono</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="submit">Invia invito</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function AssignBlocksSheet({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const blocksQ = useClientBlocks(open ? clientId : undefined);
  const { user } = useAuth();
  const bookingsQ = useCoachBookings(open ? user?.id : undefined);
  const qc = useQueryClient();
  const [eventTypes, setEventTypes] = useState<Array<{ id: string; name: string }>>([]);
  const activeBlocks = (blocksQ.data ?? []).filter((b) => b.status === "active");

  useEffect(() => {
    if (!open || !user) return;
    supabase
      .from("event_types")
      .select("id, name")
      .eq("coach_id", user.id)
      .then(({ data }) => setEventTypes((data ?? []) as Array<{ id: string; name: string }>));
  }, [open, user]);

  async function refundOne(allocationId: string, currentBooked: number) {
    if (currentBooked <= 0) {
      toast.info("Nessun credito da rimborsare per questa allocation.");
      return;
    }
    const { error } = await supabase
      .from("block_allocations")
      .update({ quantity_booked: currentBooked - 1 })
      .eq("id", allocationId);
    if (error) {
      toast.error("Errore", { description: error.message });
      return;
    }
    toast.success("Credito rimborsato (+1).");
    qc.invalidateQueries({ queryKey: ["blocks"] });
    qc.invalidateQueries({ queryKey: ["block-allocations"] });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm" variant="ghost">
          <CalendarPlus className="size-4" /> Assegna Percorsi/Blocchi
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-xl w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Assegna Percorsi a {clientName}</SheetTitle>
          <SheetDescription>
            Definisci data di partenza, numero di blocchi sequenziali e quote settimanali per tipologia.
          </SheetDescription>
        </SheetHeader>

        {activeBlocks.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium">Blocchi attivi</h3>
            <div className="space-y-2">
              {activeBlocks.map((b) => {
                const bookingsCount = (bookingsQ.data ?? []).filter((bk) => bk.block_id === b.id).length;
                return (
                  <div key={b.id} className="rounded-md border p-3 text-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Blocco #{b.sequence_order ?? 1}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(b.start_date).toLocaleDateString("it-IT")} → {new Date(b.end_date).toLocaleDateString("it-IT")}
                        </div>
                      </div>
                      <DeleteBlockButton blockId={b.id} bookingsCount={bookingsCount} />
                    </div>
                    {b.allocations.length > 0 && (
                      <div className="space-y-1.5 border-t pt-2">
                        {b.allocations.map((a) => {
                          const label = a.event_type_id
                            ? eventTypes.find((e) => e.id === a.event_type_id)?.name ?? sessionLabel(a.session_type)
                            : sessionLabel(a.session_type);
                          const remaining = a.quantity_assigned - a.quantity_booked;
                          return (
                            <div key={a.id} className="flex items-center justify-between text-xs">
                              <div className="flex flex-col">
                                <span className="font-medium">{label} <span className="text-muted-foreground">· Sett. {a.week_number}</span></span>
                                <span className="text-muted-foreground">
                                  Rimanenti: {remaining}/{a.quantity_assigned}
                                  {a.valid_until && ` · scade ${new Date(a.valid_until).toLocaleDateString("it-IT")}`}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => refundOne(a.id, a.quantity_booked)}
                                title="Rimborsa 1 credito (override)"
                              >
                                <PlusCircle className="size-4" /> +1 Credito
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <Separator className="my-4" />
          </div>
        )}

        <div className="mt-4">
          <BlockAssignmentWizard
            clientId={clientId}
            clientName={clientName}
            onCreated={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
