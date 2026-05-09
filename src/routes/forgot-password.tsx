import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Dumbbell, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error("Invio non riuscito", { description: error.message });
      return;
    }
    setSent(true);
    toast.success("Email inviata", { description: "Controlla la tua casella di posta." });
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
            <CardTitle>Recupera password</CardTitle>
            <CardDescription>
              Inserisci la tua email e ti invieremo un link per reimpostare la password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="text-center py-6 space-y-3">
                <div className="mx-auto size-12 rounded-full bg-primary/10 grid place-items-center">
                  <Mail className="size-5 text-primary" />
                </div>
                <p className="text-sm">
                  Abbiamo inviato un link a <strong>{email}</strong>. Apri l'email per continuare.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fp-email">Email</Label>
                  <Input
                    id="fp-email" type="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@esempio.it"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : "Invia link di recupero"}
                </Button>
              </form>
            )}
            <Link to="/auth" className="mt-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3" /> Torna all'accesso
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
