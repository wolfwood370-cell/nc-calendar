// ----------------------------------------------------------------------------
// CredentialsDialog — post-onboarding modal showing the new client's
// generated email + password with copy-to-clipboard helpers
// ----------------------------------------------------------------------------
// Extracted from trainer.clients.index.tsx. Parent passes `creds` (null
// when the dialog should stay closed) and `onClose` to clear them.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export interface GeneratedCredentials {
  firstName: string;
  email: string;
  password: string;
}

export function CredentialsDialog({
  creds,
  onClose,
}: {
  creds: GeneratedCredentials | null;
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
    <Dialog
      open={!!creds}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Credenziali Generate</DialogTitle>
        </DialogHeader>
        {creds && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Salva o invia queste credenziali al cliente. Non saranno più visibili dopo la
              chiusura.
            </p>
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <div>
                <Label className="text-xs uppercase text-muted-foreground">Email</Label>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <code className="text-sm font-mono break-all">{creds.email}</code>
                  <Button size="sm" variant="ghost" onClick={() => copy(creds.email, "email")}>
                    {copiedField === "email" ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
              <Separator />
              <div>
                <Label className="text-xs uppercase text-muted-foreground">
                  Password Temporanea
                </Label>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <code className="text-sm font-mono break-all">{creds.password}</code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(creds.password, "password")}
                  >
                    {copiedField === "password" ? (
                      <Check className="size-4" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={onClose}>
                Chiudi
              </Button>
              <Button onClick={() => copy(message, "message")}>
                {copiedField === "message" ? (
                  <Check className="size-4" />
                ) : (
                  <Copy className="size-4" />
                )}
                Copia Messaggio
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
