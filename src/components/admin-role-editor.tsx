import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

export type AdminRole = "admin" | "coach" | "client";

export interface AdminRoleEditorProps {
  /** Ruolo corrente dell'utente (preselezionato nel Select). */
  current: AdminRole;
  /** Chiamato quando l'admin clicca "Salva" con il nuovo ruolo scelto. */
  onSubmit: (r: AdminRole) => void;
}

/**
 * Form editor del ruolo utente dentro un Dialog admin: Select di 3 opzioni
 * (admin / coach / client) + bottone Salva. State locale per il valore in
 * editing, submit fa preventDefault + propaga al parent.
 *
 * Estratto da admin.tsx (era function RoleEditor inline).
 */
export function AdminRoleEditor({ current, onSubmit }: AdminRoleEditorProps) {
  const [r, setR] = useState<AdminRole>(current);
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
        <Select value={r} onValueChange={(v) => setR(v as AdminRole)}>
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
