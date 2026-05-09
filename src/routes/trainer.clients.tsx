import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { clients as seed, blocks, type Profile } from "@/lib/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer/clients")({
  component: ClientsPage,
});

function ClientsPage() {
  const [list, setList] = useState<Profile[]>(seed);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = list.filter((c) =>
    c.full_name.toLowerCase().includes(q.toLowerCase()) || c.email.toLowerCase().includes(q.toLowerCase())
  );

  const addClient = (data: { name: string; email: string; phone: string }) => {
    setList((cur) => [
      ...cur,
      { id: `c${cur.length + 1}`, role: "client", full_name: data.name, email: data.email, phone_number: data.phone },
    ]);
    toast.success("Cliente aggiunto");
    setOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Clienti</h1>
          <p className="text-sm text-muted-foreground mt-1">Gestisci il roster e i blocchi attivi.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="size-4" /> Aggiungi cliente</Button>
          </DialogTrigger>
          <AddClientDialog onSubmit={addClient} />
        </Dialog>
      </div>

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Blocco attivo</TableHead>
                <TableHead className="text-right">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const hasBlock = blocks.some((b) => b.client_id === c.id && b.status === "active");
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email}</TableCell>
                    <TableCell className="text-muted-foreground">{c.phone_number}</TableCell>
                    <TableCell>
                      {hasBlock ? (
                        <Badge variant="secondary" className="bg-success/10 text-success border-success/20">Attivo</Badge>
                      ) : (
                        <Badge variant="outline">Nessuno</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">Modifica</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AddClientDialog({ onSubmit }: { onSubmit: (d: { name: string; email: string; phone: string }) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Aggiungi cliente</DialogTitle>
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
        </div>
        <div className="space-y-2">
          <Label>Telefono</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="submit">Salva</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
