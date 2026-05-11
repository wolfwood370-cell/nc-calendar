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
import { Plus, Search, Loader2, Mail, X, Archive, CalendarPlus, PlusCircle, UserPlus, Copy, Check, Trash2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { sendInvitationEmail } from "@/lib/email";
import { BlockAssignmentWizard } from "@/components/block-assignment-wizard";
import { useClientBlocks, useCoachBookings, useCoachEventTypes } from "@/lib/queries";
import type { SessionType } from "@/lib/mock-data";
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
  const qc = useQueryClient();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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

  async function deleteClient(id: string, name: string) {
    const { data: res, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { client_id: id },
    });
    const errMsg = (res as { error?: string } | null)?.error;
    if (error || errMsg) {
      toast.error("Eliminazione non riuscita", { description: errMsg ?? error?.message });
      return;
    }
    toast.success(`${name} eliminato definitivamente.`);
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["blocks"] });
    load();
  }

  const [credentials, setCredentials] = useState<{ firstName: string; email: string; password: string } | null>(null);

  async function createClientAccount(data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    totalBlocks: number;
    rules: Array<{
      eventTypeId: string;
      sessionType: SessionType;
      quantityPerBlock: number;
      startBlock: number;
      endBlock: number;
    }>;
  }) {
    if (!user) return;
    const { data: res, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: data.email.toLowerCase().trim(),
        password: data.password,
        first_name: data.firstName,
        last_name: data.lastName,
      },
    });
    const errMsg = (res as { error?: string } | null)?.error;
    const newUserId = (res as { user_id?: string } | null)?.user_id;
    if (error || errMsg || !newUserId) {
      toast.error("Creazione cliente non riuscita", { description: errMsg ?? error?.message });
      return;
    }

    // Espande regole in blocchi mensili sequenziali + allocazioni
    try {
      const today = new Date();
      const blocksToInsert = Array.from({ length: data.totalBlocks }, (_, i) => {
        const start = new Date(today); start.setDate(today.getDate() + i * 30);
        const end = new Date(today); end.setDate(today.getDate() + (i + 1) * 30 - 1);
        return {
          client_id: newUserId,
          coach_id: user.id,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          status: "active" as const,
          sequence_order: i + 1,
        };
      });
      const { data: blocks, error: bErr } = await supabase
        .from("training_blocks")
        .insert(blocksToInsert)
        .select("id, sequence_order, end_date");
      if (bErr) throw bErr;
      const blockBySeq = new Map<number, { id: string; end_date: string }>();
      (blocks ?? []).forEach((b) => blockBySeq.set(b.sequence_order as number, { id: b.id as string, end_date: b.end_date as string }));

      const allocsToInsert: Array<{
        block_id: string;
        week_number: number;
        session_type: SessionType;
        event_type_id: string;
        quantity_assigned: number;
        quantity_booked: number;
        valid_until: string;
      }> = [];
      for (const rule of data.rules) {
        for (let m = rule.startBlock; m <= rule.endBlock; m++) {
          const b = blockBySeq.get(m);
          if (!b) continue;
          allocsToInsert.push({
            block_id: b.id,
            week_number: 1,
            session_type: rule.sessionType,
            event_type_id: rule.eventTypeId,
            quantity_assigned: rule.quantityPerBlock,
            quantity_booked: 0,
            valid_until: b.end_date,
          });
        }
      }
      if (allocsToInsert.length > 0) {
        const { error: aErr } = await supabase.from("block_allocations").insert(allocsToInsert);
        if (aErr) throw aErr;
      }
    } catch (e) {
      toast.warning("Cliente creato, ma assegnazione blocchi non riuscita", {
        description: (e as Error).message,
      });
    }

    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["block-allocations"] });
    qc.invalidateQueries({ queryKey: ["blocks"] });
    setCreateOpen(false);
    setCredentials({ firstName: data.firstName, email: data.email.toLowerCase().trim(), password: data.password });
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
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><UserPlus className="size-4" /> Aggiungi Cliente</Button>
            </DialogTrigger>
            <CreateClientDialog onSubmit={createClientAccount} />
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary"><Plus className="size-4" /> Invita cliente</Button>
            </DialogTrigger>
            <InviteClientDialog onSubmit={inviteClient} />
          </Dialog>
        </div>
      </div>

      <CredentialsDialog
        creds={credentials}
        onClose={() => setCredentials(null)}
      />

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
                              <AlertDialogTitle>Archiviare questo cliente?</AlertDialogTitle>
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
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                              <Trash2 className="size-4" /> Elimina
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Eliminare definitivamente {c.full_name ?? c.email}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Questa azione è <strong>irreversibile</strong>. Verranno eliminati: account di accesso,
                                profilo, prenotazioni, blocchi, allocazioni di sessioni e notifiche push del cliente.
                                I dati non potranno essere recuperati.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteClient(c.id, c.full_name ?? c.email ?? "Cliente")}
                              >
                                Elimina definitivamente
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

function generateSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const out = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 6; i++) out.push(pick(all));
  return out.sort(() => Math.random() - 0.5).join("");
}

interface RuleDraft {
  id: string;
  eventTypeId: string;
  quantityPerBlock: number;
  startBlock: number;
  endBlock: number;
}

interface CreateClientPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  totalBlocks: number;
  rules: Array<{
    eventTypeId: string;
    sessionType: SessionType;
    quantityPerBlock: number;
    startBlock: number;
    endBlock: number;
  }>;
}

const DURATION_PRESETS: Array<{ value: string; label: string; months: number | null }> = [
  { value: "1", label: "1 Mese", months: 1 },
  { value: "3", label: "3 Mesi", months: 3 },
  { value: "6", label: "6 Mesi", months: 6 },
  { value: "12", label: "12 Mesi", months: 12 },
  { value: "custom", label: "Personalizzato", months: null },
];

function CreateClientDialog({ onSubmit }: { onSubmit: (d: CreateClientPayload) => Promise<void> }) {
  const { user } = useAuth();
  const eventTypesQ = useCoachEventTypes(user?.id);
  const eventTypes = eventTypesQ.data ?? [];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [durationPreset, setDurationPreset] = useState<string>("3");
  const [customMonths, setCustomMonths] = useState<number>(3);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const totalBlocks = durationPreset === "custom"
    ? Math.max(1, customMonths)
    : (DURATION_PRESETS.find((d) => d.value === durationPreset)?.months ?? 1);

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        eventTypeId: eventTypes[0]?.id ?? "",
        quantityPerBlock: 4,
        startBlock: 1,
        endBlock: totalBlocks,
      },
    ]);
  }

  function updateRule(id: string, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  function canProceedFrom1() {
    return firstName.trim() && lastName.trim() && /\S+@\S+\.\S+/.test(email);
  }

  async function handleFinalSubmit() {
    if (rules.length === 0) {
      toast.error("Aggiungi almeno una regola di assegnazione.");
      return;
    }
    for (const r of rules) {
      if (!r.eventTypeId) { toast.error("Seleziona un Event Type per ogni regola."); return; }
      if (r.quantityPerBlock < 1) { toast.error("La quantità per blocco deve essere ≥ 1."); return; }
      if (r.startBlock < 1 || r.endBlock < r.startBlock || r.endBlock > totalBlocks) {
        toast.error(`Intervalli blocco non validi (1–${totalBlocks}).`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const expandedRules = rules.map((r) => {
        const et = eventTypes.find((e) => e.id === r.eventTypeId)!;
        return {
          eventTypeId: r.eventTypeId,
          sessionType: et.base_type as SessionType,
          quantityPerBlock: r.quantityPerBlock,
          startBlock: r.startBlock,
          endBlock: r.endBlock,
        };
      });
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        password: generateSecurePassword(),
        totalBlocks,
        rules: expandedRules,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Aggiungi Cliente — Step {step} di 3</DialogTitle>
      </DialogHeader>

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Cognome</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <p className="text-xs text-muted-foreground">
            Verrà generata automaticamente una password sicura. Potrai copiarla al termine.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Durata Percorso</Label>
            <Select value={durationPreset} onValueChange={setDurationPreset}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_PRESETS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {durationPreset === "custom" && (
            <div className="space-y-2">
              <Label>Numero di Blocchi (mesi)</Label>
              <Input
                type="number"
                min={1}
                max={36}
                value={customMonths}
                onChange={(e) => setCustomMonths(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Il percorso sarà suddiviso in <strong>{totalBlocks}</strong> blocchi mensili sequenziali (~30 giorni ciascuno).
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Definisci come distribuire le sessioni sui {totalBlocks} blocchi.
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={addRule} disabled={eventTypes.length === 0}>
              <Plus className="size-4" /> Aggiungi Regola
            </Button>
          </div>

          {eventTypes.length === 0 && (
            <p className="text-xs text-destructive">Crea prima almeno un Event Type.</p>
          )}

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {rules.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nessuna regola. Clicca "Aggiungi Regola" per iniziare.
              </div>
            ) : rules.map((r) => (
              <div key={r.id} className="rounded-md border p-3 space-y-3">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-5 space-y-1">
                    <Label className="text-xs">Event Type</Label>
                    <Select value={r.eventTypeId} onValueChange={(v) => updateRule(r.id, { eventTypeId: v })}>
                      <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                      <SelectContent>
                        {eventTypes.map((et) => (
                          <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4 sm:col-span-2 space-y-1">
                    <Label className="text-xs">Q.tà / blocco</Label>
                    <Input
                      type="number"
                      min={1}
                      value={r.quantityPerBlock}
                      onChange={(e) => updateRule(r.id, { quantityPerBlock: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2 space-y-1">
                    <Label className="text-xs">Dal blocco</Label>
                    <Input
                      type="number"
                      min={1}
                      max={totalBlocks}
                      value={r.startBlock}
                      onChange={(e) => updateRule(r.id, { startBlock: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2 space-y-1">
                    <Label className="text-xs">Al blocco</Label>
                    <Input
                      type="number"
                      min={1}
                      max={totalBlocks}
                      value={r.endBlock}
                      onChange={(e) => updateRule(r.id, { endBlock: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeRule(r.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:gap-2">
        {step > 1 && (
          <Button type="button" variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)} disabled={submitting}>
            Indietro
          </Button>
        )}
        {step < 3 && (
          <Button
            type="button"
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
            disabled={step === 1 ? !canProceedFrom1() : false}
          >
            Avanti
          </Button>
        )}
        {step === 3 && (
          <Button type="button" onClick={handleFinalSubmit} disabled={submitting || eventTypes.length === 0}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Crea cliente
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: { firstName: string; email: string; password: string } | null;
  onClose: () => void;
}) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const message = creds
    ? `Ciao ${creds.firstName}, la tua area personale su NC Calendar è pronta! Puoi accedere da qui: ${appUrl}. Email: ${creds.email} | Password temporanea: ${creds.password}. Ricordati di cambiarla al tuo primo accesso.`
    : "";

  async function copy(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success("Copiato negli appunti");
      setTimeout(() => setCopiedField((c) => (c === field ? null : c)), 1500);
    } catch {
      toast.error("Impossibile copiare");
    }
  }

  return (
    <Dialog open={!!creds} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Credenziali Generate</DialogTitle>
        </DialogHeader>
        {creds && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Salva o invia queste credenziali al cliente. Non saranno più visibili dopo la chiusura.
            </p>
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Email</Label>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <code className="text-sm font-mono break-all">{creds.email}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(creds.email, "email")}>
                    {copiedField === "email" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
              <Separator />
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Password Temporanea</Label>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <code className="text-sm font-mono break-all">{creds.password}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(creds.password, "password")}>
                    {copiedField === "password" ? <Check className="size-4" /> : <Copy className="size-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={onClose}>Chiudi</Button>
              <Button onClick={() => copy(message, "message")}>
                {copiedField === "message" ? <Check className="size-4" /> : <Copy className="size-4" />}
                Copia Messaggio
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
