import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export interface PathStartDateCardProps {
  /** Data corrente d'inizio percorso (può essere undefined se non ancora scelta). */
  pathStart: Date | undefined;
  /** Chiamato quando il coach seleziona una nuova data dal calendar popup. */
  onSelectStart: (d: Date | undefined) => void;
  /** Numero totale di settimane derivate (mostrato in footer). */
  totalWeeks: number;
  /** Numero totale di blocchi del percorso (mostrato in footer). */
  totalBlocks: number;
  /** Settimane per blocco (costante della config, mostrata nel calcolo footer). */
  weeksPerBlock: number;
}

/**
 * Card "Data Inizio Percorso": Popover con Calendar single-select per
 * scegliere il lunedì di inizio percorso, + footer con riepilogo
 * settimane totali. Validazione lunedì-only è enforced upstream nel
 * parent (handleStartChange).
 */
export function PathStartDateCard({
  pathStart,
  onSelectStart,
  totalWeeks,
  totalBlocks,
  weeksPerBlock,
}: PathStartDateCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Data Inizio Percorso</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-64 justify-start text-left font-normal",
                !pathStart && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="size-4" />
              {pathStart
                ? format(pathStart, "EEEE dd MMMM yyyy", { locale: it })
                : "Seleziona un lunedì"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={pathStart}
              onSelect={onSelectStart}
              weekStartsOn={1}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <p className="text-sm text-muted-foreground">
          Solo i lunedì sono validi. Settimane totali: <strong>{totalWeeks}</strong> ({totalBlocks}{" "}
          blocchi × {weeksPerBlock})
        </p>
      </CardContent>
    </Card>
  );
}
