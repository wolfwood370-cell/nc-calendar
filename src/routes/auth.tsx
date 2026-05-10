import { createFileRoute, useNavigate, Link, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { Dumbbell, ArrowRight, Loader2 } from "lucide-react";
import { useAuth, pathForRole } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.1A6.97 6.97 0 0 1 5.46 12c0-.73.13-1.44.36-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const { session, role, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!loading && session && role) {
    return <Navigate to={pathForRole(role)} />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Accesso non riuscito", { description: traduciErrore(error.message) });
      return;
    }
    toast.success("Accesso effettuato");
    // role will be fetched by AuthProvider; navigate to root which redirects by role
    navigate({ to: "/" });
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName },
      },
    });
    setBusy(false);
    if (error) {
      toast.error("Registrazione non riuscita", { description: traduciErrore(error.message) });
      return;
    }
    toast.success("Account creato", { description: "Benvenuto!" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary/10 via-background to-accent/40 border-r">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Dumbbell className="size-5" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight">Stride</span>
        </div>
        <div className="space-y-6 max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
            Programmato in blocchi di 4 settimane. Prenotato in pochi secondi.
          </h1>
          <p className="text-muted-foreground">
            Uno studio essenziale per personal trainer e clienti — quote, calendari e
            valutazioni in un unico spazio di lavoro.
          </p>
          <div className="grid grid-cols-2 gap-3 pt-4">
            <Card className="p-4">
              <Users className="size-5 text-primary" />
              <p className="mt-3 text-sm font-medium">Roster clienti</p>
              <p className="text-xs text-muted-foreground">Gestisci ogni blocco e quota.</p>
            </Card>
            <Card className="p-4">
              <Activity className="size-5 text-primary" />
              <p className="mt-3 text-sm font-medium">Valutazioni</p>
              <p className="text-xs text-muted-foreground">PT, BIA, Test Funzionale.</p>
            </Card>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">© Stride Studio</p>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-8">
          <div className="lg:hidden flex items-center gap-2">
            <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Dumbbell className="size-5" />
            </div>
            <span className="font-display text-xl font-semibold">Stride</span>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Bentornato</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Accedi al tuo account o registrati per iniziare.
            </p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "login" | "register")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Accedi</TabsTrigger>
              <TabsTrigger value="register">Registrati</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-6">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-login">Email</Label>
                  <Input id="email-login" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="tu@esempio.it" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pw-login">Password</Label>
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                      Password dimenticata?
                    </Link>
                  </div>
                  <Input id="pw-login" type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <>Accedi <ArrowRight className="size-4" /></>}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="mt-6">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name-reg">Nome completo</Label>
                  <Input id="name-reg" type="text" required value={fullName}
                    onChange={(e) => setFullName(e.target.value)} placeholder="Mario Rossi" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-reg">Email</Label>
                  <Input id="email-reg" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="tu@esempio.it" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw-reg">Password</Label>
                  <Input id="pw-reg" type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Almeno 6 caratteri" />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <>Crea account <ArrowRight className="size-4" /></>}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function traduciErrore(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "Email o password non corrette.";
  if (m.includes("user already registered")) return "Questa email è già registrata.";
  if (m.includes("email not confirmed")) return "Conferma la tua email prima di accedere.";
  if (m.includes("non invitata") || m.includes("not invited")) {
    return "Questa email non è stata invitata da un Coach. Chiedi al tuo coach di inviarti un invito.";
  }
  if (m.includes("database error") || m.includes("unexpected_failure")) {
    return "Email non invitata da un Coach. Contatta il tuo coach per ricevere un invito.";
  }
  if (m.includes("password")) return "La password non soddisfa i requisiti.";
  return msg;
}
