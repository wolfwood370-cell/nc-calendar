// ----------------------------------------------------------------------------
// ClientSlotGroups — gli orari di un giorno, a gruppi (lato cliente, passata
// 02, audit B6 e V15)
// ----------------------------------------------------------------------------
// I gruppi di slotGroups (client-slots.ts): prima «Consigliati», col motivo
// sotto l'etichetta, poi mattina, pomeriggio e sera; un orario consigliato
// sta solo fra i consigliati, e nessun badge sopra i pulsanti. Ogni gruppo è
// un radiogroup con un solo punto di Tab (l'orario scelto, altrimenti il
// primo); le frecce, anche quelle verticali, Home ed End spostano il focus e
// la scelta dentro il gruppo (segmentKeyTarget, come segmented-control.tsx).
// Lo usano Prenota e Sposta (04): il componente non sa per cosa si sceglie.
// Niente hook: il focus passa all'orario cercandolo nel gruppo.
// ----------------------------------------------------------------------------

import type { KeyboardEvent } from "react";
import { Sparkles } from "lucide-react";
import { slotGroups, type ClientSlotDay } from "@/lib/client-slots";
import { segmentKeyTarget } from "@/lib/segment-keys";
import { cn } from "@/lib/utils";

export interface ClientSlotGroupsProps {
  day: ClientSlotDay;
  /** L'orario scelto (iso), o null. */
  selectedIso: string | null;
  onSelect: (iso: string) => void;
}

export function ClientSlotGroups({ day, selectedIso, onSelect }: ClientSlotGroupsProps) {
  return (
    <div className="flex flex-col gap-3">
      {slotGroups(day).map((group) => {
        const selected = group.slots.findIndex((s) => s.iso === selectedIso);
        const recommended = group.key === "consigliati";
        const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
          const target = segmentKeyTarget(e.key, index, group.slots.length);
          if (target === null) return;
          e.preventDefault();
          const items = e.currentTarget
            .closest('[role="radiogroup"]')
            ?.querySelectorAll<HTMLElement>("[data-slot]");
          items?.[target]?.focus();
          const next = group.slots[target];
          if (next && next.iso !== selectedIso) onSelect(next.iso);
        };
        return (
          <div key={group.key} className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <p
                className={cn(
                  "flex items-center gap-1.5 text-[13px] font-bold",
                  recommended ? "text-aura-primary" : "text-on-surface-variant",
                )}
              >
                {recommended && <Sparkles className="size-3.5" aria-hidden />}
                {group.label}
              </p>
              {group.reason && (
                <p className="text-[13px] leading-[1.4] text-on-surface-variant">{group.reason}</p>
              )}
            </div>
            <div role="radiogroup" aria-label={group.aria} className="grid grid-cols-3 gap-2">
              {group.slots.map((slot, i) => {
                const checked = i === selected;
                return (
                  <button
                    key={slot.iso}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={checked || (selected < 0 && i === 0) ? 0 : -1}
                    data-slot
                    onClick={() => {
                      if (!checked) onSelect(slot.iso);
                    }}
                    onKeyDown={onKeyDown(i)}
                    className={cn(
                      "h-12 rounded-[14px] border text-base font-bold tabular-nums",
                      checked
                        ? "border-primary-container bg-primary-container text-white"
                        : recommended
                          ? "border-primary-fixed-dim bg-primary-fixed text-aura-primary"
                          : "border-outline-variant bg-white text-aura-primary",
                    )}
                  >
                    {slot.time}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
