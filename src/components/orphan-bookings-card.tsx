import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { Sparkles, Check, X as XIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Subset structural del orphan booking richiesto dalla Card.
 * Tenuto separato dall'interface ClientPathPage interno così l'aggiunta
 * di nuovi campi (event_type_id, session_type, ecc.) non costringe la
 * Card a importarli quando non li usa.
 */
export interface OrphanBookingItem {
  id: string;
  scheduled_at: string;
  title: string | null;
  notes: string | null;
}

export interface OrphanBookingsCardProps<T extends OrphanBookingItem> {
  /** Sessioni orfane da revisionare. Se vuoto, la Card non viene renderizzata. */
  orphans: readonly T[];
  /** Chiamato quando il coach conferma una sessione orfana (la associa al percorso). */
  onConfirm: (orphan: T) => void;
  /** Chiamato quando il coach scarta una sessione orfana (l'ignora). */
  onDiscard: (orphan: T) => void;
}

/**
 * Card "Sessioni da Revisionare": elenca i bookings importati da Google
 * Calendar che non hanno un block_id assegnato, con azioni Conferma/Scarta
 * per ogni riga. Estratto da trainer.clients.$id.tsx — la Card non
 * renderizza nulla se `orphans` è vuoto, così il chiamante può montare
 * sempre il componente senza guard esterno.
 */
export function OrphanBookingsCard<T extends OrphanBookingItem>({
  orphans,
  onConfirm,
  onDiscard,
}: OrphanBookingsCardProps<T>) {
  if (orphans.length === 0) return null;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Sessioni da Revisionare ({orphans.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Titolo</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orphans.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-sm">
                  {format(parseISO(o.scheduled_at), "EEE dd MMM yyyy HH:mm", { locale: it })}
                </TableCell>
                <TableCell className="text-sm">
                  <div className="font-medium">{o.title ?? "(senza titolo)"}</div>
                  {o.notes && (
                    <div className="text-xs text-muted-foreground line-clamp-1">{o.notes}</div>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="default" onClick={() => onConfirm(o)}>
                      <Check className="size-4" /> Conferma
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDiscard(o)}>
                      <XIcon className="size-4" /> Scarta
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
