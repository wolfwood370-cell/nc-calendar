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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Loader2, Mail, X, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

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
    let cq = supabase.from("profiles").select("id, full_name, email, phone");
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
    toast.success("Invito creato", { description: `Comunica a ${data.email} di registrarsi.` });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Clienti</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Invita nuovi clienti e gestisci il roster.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4" /> Invita cliente</Button>
          </DialogTrigger>
          <InviteClientDialog onSubmit={inviteClient} />
        </Dialog>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
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
