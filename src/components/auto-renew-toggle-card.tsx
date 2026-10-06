import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

export interface AutoRenewToggleCardProps {
  /** Stato corrente del toggle. null = non ancora caricato (Card non viene renderizzata). */
  value: boolean | null;
  /** True mentre il toggle è in fase di scrittura DB (disabilita la Switch). */
  saving: boolean;
  /** Callback chiamato quando il coach cambia stato. */
  onChange: (next: boolean) => void;
}

/**
 * Card "Rinnovo automatico blocchi mensili": Switch + descrizione contestuale
 * che cambia in base allo stato corrente. Estratto da trainer.clients.$id.tsx
 * — il `value === null` guard è interno così il parent non deve scrivere
 * `{autoRenewBlocks !== null && (...)}` attorno al component.
 */
export function AutoRenewToggleCard({ value, saving, onChange }: AutoRenewToggleCardProps) {
  if (value === null) return null;
  return (
    <Card className="rounded-[28px] border-0 shadow-soft-blue">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-semibold text-on-surface">
          Rinnovo automatico blocchi mensili
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {/* I crediti valgono fino alla fine del loro blocco e non passano al
              blocco dopo (decisione di Nicolò del 28/09, sul server dal giro
              del 02/10/2026): niente più «7 giorni di tolleranza per
              consumare i residui» (passata 10 del lato cliente). */}
          {value
            ? "Quando il blocco corrente termina, ne verrà creato uno nuovo automaticamente con lo stesso template. I crediti valgono fino alla fine del loro blocco: quelli non usati non passano al blocco dopo."
            : "I blocchi non si rinnoveranno automaticamente. Alla fine del blocco corrente dovrai crearne uno nuovo manualmente."}
        </div>
        <Switch
          checked={value}
          disabled={saving}
          onCheckedChange={onChange}
          aria-label="Rinnovo automatico blocchi mensili"
        />
      </CardContent>
    </Card>
  );
}
