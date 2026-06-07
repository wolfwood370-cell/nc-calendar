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
  type: EventTypeRow;
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * Compact row card per event type (servizio).
 * Layout: dot colorata · nome · badges (durata/luogo/buffer) · actions.
 * Footprint ridotto rispetto alla card "hero" precedente per permettere
 * più servizi visibili contemporaneamente (la pagina ora elenca anche
 * sessioni gratuite, PT Pack, eventi custom, etc.).
 */
export function EventTypeServiceCard({ type: t, onEdit, onDelete }: EventTypeServiceCardProps) {
  return (
    <div
      className="group bg-white/70 backdrop-blur-xl border border-white/40 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-200 border-l-[6px] flex items-center gap-4 p-4"
      style={{ borderLeftColor: t.color }}
    >
      {/* Icon */}
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `color-mix(in oklab, ${t.color} 15%, white)`, color: t.color }}
      >
        {t.location_type === "online" ? (
          <Video className="size-5" />
        ) : (
          <Dumbbell className="size-5" />
        )}
      </div>

      {/* Main */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-semibold text-foreground truncate">{t.name}</h3>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {t.duration} min
          </span>
          <span className="inline-flex items-center gap-1">
            {t.location_type === "online" ? (
              <Video className="size-3" />
            ) : (
              <MapPin className="size-3" />
            )}
            {t.location_type === "online" ? "Online" : "In studio"}
          </span>
          {t.buffer_minutes > 0 && (
            <span className="inline-flex items-center gap-1">+{t.buffer_minutes} min pausa</span>
          )}
        </div>
        {t.description && (
          <p className="mt-1 text-[12px] text-muted-foreground/80 truncate">{t.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          className="rounded-full size-8 text-muted-foreground hover:text-foreground"
          aria-label="Modifica"
        >
          <Pencil className="size-4" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              aria-label="Elimina"
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
