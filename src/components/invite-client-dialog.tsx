// ----------------------------------------------------------------------------
// InviteClientDialog — simple 3-field form to email a sign-up invitation
// ----------------------------------------------------------------------------
// Extracted from trainer.clients.index.tsx for clarity. Parent owns the
// submission handler (sendInvitationEmail + DB insert) and just passes
// it down as `onSubmit`.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface InviteClientPayload {
  name: string;
  email: string;
  phone: string;
}

export function InviteClientDialog({
  onSubmit,
}: {
  onSubmit: (d: InviteClientPayload) => void;
}) {
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
