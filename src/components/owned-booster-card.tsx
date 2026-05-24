import { Sparkles } from "lucide-react";
import { AuraProgressRing } from "@/components/ui/aura-progress-ring";

export interface OwnedBoosterCredit {
  id: string;
  eventName: string;
  quantity: number;
  quantity_booked: number;
  remaining: number;
  expires_at: string;
}

export interface OwnedBoosterCardProps {
  /** Riga credito booster da renderizzare. */
  credit: OwnedBoosterCredit;
  /** True se il client è autorizzato all'acquisto di add-on (gates il pulsante Ricarica). */
  canPurchaseAddons: boolean;
  /** True quando una mutation acquisto è in corso (disable globale). */
  isPurchaseLoading: boolean;
  /** Chiamato quando l'utente clicca "Ricarica Crediti" (default top-up single). */
  onRecharge: () => void;
}

/**
 * Card singolo booster già acquistato dal cliente: AuraProgressRing
 * con used/total + nome evento + data scadenza + (se ≤2 rimanenti)
 * bottone "Ricarica Crediti" che apre la purchase flow del top-up
 * single.
 *
 * Estratto da client.store.tsx (era inline article).
 */
export function OwnedBoosterCard({
  credit: c,
  canPurchaseAddons,
  isPurchaseLoading,
  onRecharge,
}: OwnedBoosterCardProps) {
  const total = c.quantity;
  const used = c.quantity_booked;
  const remaining = c.remaining;
  const isLow = total > 0 && remaining > 0 && remaining <= 2;

  return (
    <article
      className="bg-surface-container-lowest rounded-[32px] border border-outline-variant/20 shadow-[0_12px_32px_rgba(0,0,0,0.04)] p-5 flex items-center gap-4"
      aria-label={`Booster ${c.eventName}: ${remaining} di ${total} crediti rimanenti`}
    >
      <AuraProgressRing
        used={used}
        total={total}
        size={84}
        strokeWidth={8}
        // Center label reads as the user's question: "how many credits do I
        // still have?" → remaining / total.
        label={`${remaining} / ${total}`}
      />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <h3 className="text-base font-semibold text-on-surface truncate">{c.eventName}</h3>
        <p className="text-xs text-on-surface-variant">
          Scade il{" "}
          {new Date(c.expires_at).toLocaleDateString("it-IT", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })}
        </p>
        {isLow && (
          <button
            type="button"
            onClick={onRecharge}
            disabled={!canPurchaseAddons || isPurchaseLoading}
            className="mt-1 inline-flex self-start items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-tertiary-container/20 text-tertiary disabled:opacity-50"
          >
            <Sparkles className="size-3.5" />
            Ricarica Crediti
          </button>
        )}
      </div>
    </article>
  );
}
