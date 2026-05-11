import { createFileRoute, Navigate, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, pathForRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Shield, Users, UserCog, LogOut, Dumbbell } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  coach_id: string | null;
}
interface RoleRow {
  user_id: string;
  role: "admin" | "coach" | "client";
}

function AdminPage() {
  const { session, role, loading, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    const [{ data: ps }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email, coach_id").is("deleted_at", null),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    setProfiles((ps as ProfileRow[]) ?? []);
    setRoles((rs as RoleRow[]) ?? []);
    setBusy(false);
  }

  useEffect(() => {
    if (role === "admin") load();
  }, [role]);

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!session) return <Navigate to="/auth" />;
  if (role !== "admin") return <Navigate to={pathForRole(role)} />;

  const roleOf = (uid: string) => roles.find((r) => r.user_id === uid)?.role ?? "client";
  const coaches = profiles.filter((p) => roleOf(p.id) === "coach");
  const clients = profiles.filter((p) => roleOf(p.id) === "client");
  const admins = profiles.filter((p) => roleOf(p.id) === "admin");

  async function changeRole(userId: string, newRole: "admin" | "coach" | "client") {
    const { error } = await supabase
      .from("user_roles")
      .update({ role: newRole })
      .eq("user_id", userId);
    if (error) {
      toast.error("Errore", { description: error.message });
      return;
    }
    toast.success("Ruolo aggiornato");
    setEditOpen(null);
    load();
  }

  async function assignCoach(clientId: string, coachId: string | null) {
    const { error } = await supabase
      .from("profiles")
      .update({ coach_id: coachId })
      .eq("id", clientId);
    if (error) {
      toast.error("Errore", { description: error.message });
      return;
    }
    toast.success("Coach assegnato");
    load();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="h-14 border-b bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Dumbbell className="size-4" />
            </div>
            <span className="font-display font-semibold">Stride</span>
            <Badge variant="secondary" className="ml-2">
              <Shield className="size-3 mr-1" /> Admin
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/trainer">Vista Coach</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" /> Esci
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Pannello Admin</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Benvenuto {user?.email}. Gestisci utenti, coach e clienti del sistema.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard icon={Shield} label="Admin" value={admins.length} />
          <StatCard icon={UserCog} label="Coach" value={coaches.length} />
          <StatCard icon={Users} label="Clienti" value={clients.length} />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Utenti del sistema</CardTitle>
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Coach assegnato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => {
                  const r = roleOf(p.id);
                  const coachName = p.coach_id
                    ? (profiles.find((x) => x.id === p.coach_id)?.full_name ?? "—")
                    : "—";
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r === "admin" ? "default" : r === "coach" ? "secondary" : "outline"
                          }
                        >
                          {r}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {r === "client" ? (
                          <Select
                            value={p.coach_id ?? "none"}
                            onValueChange={(v) => assignCoach(p.id, v === "none" ? null : v)}
                          >
                            <SelectTrigger className="h-8 w-[180px]">
                              <SelectValue placeholder="Nessuno" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Nessuno</SelectItem>
                              {coaches.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.full_name ?? c.email}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-muted-foreground text-sm">{coachName}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog
                          open={editOpen === p.id}
                          onOpenChange={(o) => setEditOpen(o ? p.id : null)}
                        >
                          <DialogTrigger asChild>
                            <Button size="sm" variant="ghost">
                              Cambia ruolo
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Cambia ruolo: {p.full_name ?? p.email}</DialogTitle>
                            </DialogHeader>
                            <RoleEditor current={r} onSubmit={(nr) => changeRole(p.id, nr)} />
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Shield;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="font-display text-3xl font-semibold mt-1">{value}</p>
        </div>
        <div className="size-10 rounded-md bg-primary/10 text-primary grid place-items-center">
          <Icon className="size-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function RoleEditor({
  current,
  onSubmit,
}: {
  current: "admin" | "coach" | "client";
  onSubmit: (r: "admin" | "coach" | "client") => void;
}) {
  const [r, setR] = useState(current);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(r);
      }}
    >
      <div className="space-y-2">
        <Label>Nuovo ruolo</Label>
        <Select value={r} onValueChange={(v) => setR(v as "admin" | "coach" | "client")}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="coach">Coach</SelectItem>
            <SelectItem value="client">Client</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DialogFooter>
        <Button type="submit">Salva</Button>
      </DialogFooter>
    </form>
  );
}
