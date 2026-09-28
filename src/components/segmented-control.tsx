// ----------------------------------------------------------------------------
// Controllo segmentato e tab (audit O3, V10)
// ----------------------------------------------------------------------------
// Gruppo di scelte mutuamente esclusive: role="radiogroup"/"radio", oppure
// role="tablist"/"tab" con kind="tabs". Un solo punto di Tab per gruppo
// (tabindex rotante); le frecce, anche quelle verticali, Home ed End spostano
// il fuoco e la scelta insieme, perché il risultato è sulla stessa pagina
// (O3). Radix RadioGroup, usato fino alla passata 09, con Home ed End
// spostava il fuoco senza scegliere e con orientation="horizontal" scartava
// ↑ e ↓: la tastiera ora è qui, con segmentKeyTarget (lib/segment-keys.ts).
// Aspetto del prototipo: pista surface-container, segmento scelto bianco con
// ombra; 32px per filtri e finestre, 36px per i tab di pagina (size="tab").
// appearance="plain" lascia l'aspetto al chiamante (le schede di «Tipo di
// percorso») e tiene ruoli e tastiera.
// Il componente non ha hook: il fuoco passa al segmento cercandolo nel
// gruppo, e le prove lo chiamano come una funzione (segmented-control.test.ts).
// ----------------------------------------------------------------------------

import type { KeyboardEvent, ReactNode } from "react";
import { segmentKeyTarget } from "@/lib/segment-keys";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Nome accessibile quando l'etichetta è solo un'icona. */
  ariaLabel?: string;
}

const TRACK = "flex rounded-full bg-surface-container p-[3px]";

const ITEM = {
  md: "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
  tab: "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
};

const ITEM_STATE =
  "data-[state=checked]:bg-white data-[state=checked]:text-aura-primary data-[state=checked]:shadow-[0_1px_3px_rgba(0,0,0,0.1)] data-[state=unchecked]:text-on-surface-variant data-[state=unchecked]:hover:text-on-surface";

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  ariaLabelledby,
  kind = "radio",
  size = "md",
  appearance = "track",
  className,
  itemClassName,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel?: string;
  /** Id dell'etichetta visibile del gruppo, al posto di ariaLabel. */
  ariaLabelledby?: string;
  /** «tabs» per i tab di pagina: role="tablist" e aria-selected. */
  kind?: "radio" | "tabs";
  /** md: 32px (filtri, finestre); tab: 36px (tab di pagina). */
  size?: "md" | "tab";
  /** plain: niente pista né segmento; l'aspetto lo dà itemClassName. */
  appearance?: "track" | "plain";
  className?: string;
  /** Classi in più per ogni segmento (es. un padding diverso), o una funzione della scelta. */
  itemClassName?: string | ((checked: boolean) => string);
}) {
  const tabs = kind === "tabs";
  const selected = options.findIndex((o) => o.value === value);
  const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const target = segmentKeyTarget(e.key, index, options.length);
    if (target === null) return;
    // Anche il Calendario ascolta ← e →: il gruppo le tiene per sé.
    e.preventDefault();
    const items = e.currentTarget
      .closest("[data-segmented]")
      ?.querySelectorAll<HTMLElement>("[data-segment]");
    items?.[target]?.focus();
    const next = options[target];
    if (next && next.value !== value) onChange(next.value);
  };
  return (
    <div
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      data-segmented
      className={cn(appearance === "track" && TRACK, className)}
    >
      {options.map((o, i) => {
        const checked = i === selected;
        return (
          <button
            key={o.value}
            type="button"
            role={tabs ? "tab" : "radio"}
            aria-checked={tabs ? undefined : checked}
            aria-selected={tabs ? checked : undefined}
            aria-label={o.ariaLabel}
            tabIndex={checked || (selected < 0 && i === 0) ? 0 : -1}
            data-segment
            data-state={checked ? "checked" : "unchecked"}
            onClick={() => {
              if (!checked) onChange(o.value);
            }}
            onKeyDown={onKeyDown(i)}
            className={cn(
              appearance === "track" && [ITEM[size], ITEM_STATE],
              typeof itemClassName === "function" ? itemClassName(checked) : itemClassName,
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
