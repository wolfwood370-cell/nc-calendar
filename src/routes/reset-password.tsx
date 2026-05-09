import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dumbbell, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase auto-handles the recovery hash; verify a session exists.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Le password non coincidono");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error("Aggiornamento non riuscito", { description: error.message });
      return;
    }
    toast.success("Password aggiornata");
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-lg bg-primary text-primary-foreground grid place-items-center">
            <Dumbbell className="size-5" />
          </div>
          <span className="font-display text-xl font-semibold">Stride</span>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Imposta nuova password</CardTitle>
            <CardDescription>Scegli una nuova password sicura per il tuo account.</CardDescription>
          </CardHeader>
          <CardContent>
            {!ready ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin mx-auto mb-2" />
                Verifica del link di recupero…
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pw">Nuova password</Label>
                  <Input id="pw" type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw2">Conferma password</Label>
                  <Input id="pw2" type="password" required minLength={6} value={confirm}
                    onChange={(e) => setConfirm(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Aggiorna password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
