import { Video, Dumbbell, Clock, MapPin, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { EventTypeRow } from "@/lib/queries";

export interface EventTypeServiceCardProps {
  /** Event type da renderizzare nella card. */
  type: EventTypeRow;
  /** Click su "Modifica" (apre dialog di edit nel parent). */
  onEdit: () => void;
  /** Confermato click "Elimina" dentro AlertDialog interno. */
  onDelete: () => void;
}

/**
 * Card visuale di un event type (servizio) nella pagina trainer/event-types.
 * Bordo sinistro colorato con il color del tipo, badge per duration/location/
 * buffer, Modifica button + Elimina con AlertDialog di conferma interno.
 *
 * Estratto da trainer.event-types.tsx (era function ServiceCard inline).
 */
export function EventTypeServiceCard({ type: t, onEdit, onDelete }: EventTypeServiceCardProps) {
  const tintBg = `color-mix(in oklab, ${t.color} 15%, white)`;
  return (
    <div
      className="bg-white/60 backdrop-blur-xl border border-white/40 rounded-[24px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300 border-l-[8px] flex flex-col p-6"
      style={{ borderLeftColor: t.color }}
    >
      <div className="flex items-start gap-4 mb-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: tintBg, color: t.color }}
        >
          {t.location_type === "online" ? (
            <Video className="size-6" />
          ) : (
            <Dumbbell className="size-6" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-[20px] leading-tight font-bold text-foreground truncate">{t.name}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-muted-foreground text-[12px] font-semibold">
              <Clock className="size-3" />
              {t.duration} min
            </span>
            <span className="inline-flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-muted-foreground text-[12px] font-semibold">
              {t.location_type === "online" ? (
                <Video className="size-3" />
              ) : (
                <MapPin className="size-3" />
              )}
              {t.location_type === "online" ? "Online" : "In studio"}
            </span>
            {t.buffer_minutes > 0 && (
              <span className="inline-flex items-center gap-1 bg-muted px-3 py-1 rounded-full text-muted-foreground text-[12px] font-semibold">
                +{t.buffer_minutes} min di pausa
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-sm text-muted-foreground mb-6 flex-grow">
        {t.description || "Nessuna descrizione disponibile."}
      </p>
      <div className="border-t border-border pt-4 flex items-center justify-between mt-auto">
        <Button variant="outline" size="sm" onClick={onEdit} className="rounded-full px-4">
          <Pencil className="size-4" /> Modifica
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminare la tipologia?</AlertDialogTitle>
              <AlertDialogDescription>
                "{t.name}" verrà rimossa. Le prenotazioni esistenti non saranno modificate.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>Elimina</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
