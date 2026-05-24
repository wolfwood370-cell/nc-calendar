import { Mail, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Subset structural di una riga invitation. */
export interface PendingInvitation {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
}

export interface PendingInvitationsCardProps {
  /** Inviti in attesa da renderizzare. Se vuoto, la Card non viene renderizzata. */
  invitations: readonly PendingInvitation[];
  /** Callback per annullare un singolo invito (pulsante X). */
  onCancel: (id: string) => void;
}

/**
 * Card "Inviti in attesa" del trainer/clients: tabella nome/email/telefono/
 * stato/azioni con pulsante annulla per riga. Restituisce null se nessun
 * invito attivo — il guard era esterno nel parent, ora è interno per
 * pulizia.
 *
 * Estratto da trainer.clients.index.tsx (era inline conditional Card).
 */
export function PendingInvitationsCard({ invitations, onCancel }: PendingInvitationsCardProps) {
  if (invitations.length === 0) return null;

  return (
    <Card className="mb-6 rounded-[32px] border border-white/40 bg-white/60 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
      <CardHeader>
        <CardTitle className="text-base font-manrope font-semibold flex items-center gap-2">
          <Mail className="size-4" /> Inviti in attesa ({invitations.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table className="border-separate border-spacing-0 [&_tr]:border-0">
          <TableHeader className="[&_tr]:border-0">
            <TableRow className="border-0 hover:bg-transparent">
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline">
                Nome
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline">
                Email
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline">
                Telefono
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline">
                Stato
              </TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-semibold text-outline text-right">
                Azioni
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-outline-variant/10">
            {invitations.map((i) => (
              <TableRow key={i.id} className="border-0 hover:bg-white/40 transition-colors">
                <TableCell className="font-medium">{i.full_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{i.email}</TableCell>
                <TableCell className="text-muted-foreground">{i.phone ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="rounded-full">
                    In attesa
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => onCancel(i.id)}
                  >
                    <X className="size-4" /> Annulla
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
