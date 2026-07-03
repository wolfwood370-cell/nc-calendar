import { Pencil, Trash2 } from "lucide-react";
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
 * Riga stepper Durata/Buffer/Prezzo: label a sinistra, gruppo −/valore/+ a destra.
 * I bottoni aprono il dialog di modifica (nessuna mutazione inline).
 */
function StepperRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-on-surface-variant">{label}</span>
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Riduci ${label.toLowerCase()}`}
          className="size-7 rounded-full border border-outline-variant bg-white text-on-surface-variant text-[16px] leading-none flex items-center justify-center cursor-pointer"
        >
          −
        </button>
        <strong className="min-w-16 text-center text-[14px] font-bold text-on-surface tabular-nums">
          {value}
        </strong>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Aumenta ${label.toLowerCase()}`}
          className="size-7 rounded-full border border-outline-variant bg-white text-on-surface-variant text-[16px] leading-none flex items-center justify-center cursor-pointer"
        >
          +
        </button>
      </span>
    </div>
  );
}

/**
 * Card verticale per event type (servizio), fedele al mock "Trainer Event Types":
 * fascia colore in alto · quadrato colore + nome + toggle attivo ·
 * stepper Durata/Buffer/Prezzo · footer con contatore prenotazioni e azioni.
 */
export function EventTypeServiceCard({ type: t, onEdit, onDelete }: EventTypeServiceCardProps) {
  const active = t.client_bookable;
  return (
    <div
      className={`relative overflow-hidden bg-white rounded-[28px] shadow-[0px_4px_20px_rgba(0,86,133,0.05)] p-6 flex flex-col gap-4 ${active ? "" : "opacity-50"}`}
    >
      {/* Fascia accent orizzontale in alto */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-1.5"
        style={{ backgroundColor: t.color }}
      />

      {/* Header: quadrato colore + nome + toggle */}
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onEdit}
            title="Cambia colore"
            aria-label="Cambia colore"
            className="size-9 rounded-[12px] shrink-0 cursor-pointer"
            style={{ backgroundColor: t.color }}
          />
          <h3 className="text-[18px] font-bold text-on-surface truncate">{t.name}</h3>
        </div>
        {/* Toggle attivo/inattivo (riflette client_bookable, modifica via dialog) */}
        <button
          type="button"
          role="switch"
          aria-checked={active}
          aria-label={active ? "Servizio attivo" : "Servizio non prenotabile"}
          onClick={onEdit}
          className={`relative w-10 h-[22px] rounded-full shrink-0 cursor-pointer transition-colors duration-150 ${active ? "bg-aura-primary" : "bg-outline-variant"}`}
        >
          <span
            className={`absolute top-0.5 size-[18px] rounded-full bg-white transition-[left] duration-150 ${active ? "left-5" : "left-0.5"}`}
          />
        </button>
      </div>

      {/* Stepper Durata / Buffer / Prezzo */}
      <div className="flex flex-col gap-3 border-t border-[#f1f5f9] pt-4">
        <StepperRow label="Durata" value={`${t.duration} min`} onEdit={onEdit} />
        <StepperRow label="Buffer" value={`${t.buffer_minutes} min`} onEdit={onEdit} />
        {/* Prezzo: campo non ancora presente nei dati, placeholder visivo */}
        <StepperRow label="Prezzo" value="— €" onEdit={onEdit} />
      </div>

      {/* Footer: contatore prenotazioni + azioni discrete */}
      <div className="flex items-center justify-between gap-2 border-t border-[#f1f5f9] pt-3">
        <div className="flex items-center gap-1.5 text-[12px] text-outline">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 3v18h18" />
            <path d="m19 9-5 5-4-4-3 3" />
          </svg>
          <span>
            <span className="tabular-nums">—</span> prenotazioni questo mese
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onEdit}
            className="rounded-full size-7 text-muted-foreground hover:text-foreground"
            aria-label="Modifica"
          >
            <Pencil className="size-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                aria-label="Elimina"
              >
                <Trash2 className="size-3.5" />
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
    </div>
  );
}
