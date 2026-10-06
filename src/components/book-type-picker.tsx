// ----------------------------------------------------------------------------
// BookTypePicker — «Cosa vuoi prenotare?» (lato cliente, passata 02, audit B5)
// ----------------------------------------------------------------------------
// Tutte le tipologie del cliente, nell'ordine di getBookState (client-book.ts),
// anche quelle esaurite e quelle che si prenotano col coach, ognuna col suo
// motivo. Un radiogroup: le prenotabili si scelgono (anello a destra), le
// altre hanno aria-disabled e la freccia, e il tocco, Invio o Spazio aprono
// «Come si prenota». Un solo punto di Tab (la scelta, altrimenti la prima);
// le frecce, Home ed End spostano il focus su tutte le opzioni e scelgono
// solo le prenotabili (segmentKeyTarget, come segmented-control.tsx).
// L'icona della tipologia ha il colore di tileIcon, come il dettaglio e la
// Home: sotto il 3:1 sulla sua tinta passa al primario (passata 09).
// ----------------------------------------------------------------------------

import type { KeyboardEvent, Ref } from "react";
import { ChevronRight } from "lucide-react";
import { typeTint, type BookOption } from "@/lib/client-book";
import { tileIcon } from "@/lib/client-session-detail";
import { CARD_TITLE } from "@/lib/client-type";
import { segmentKeyTarget } from "@/lib/segment-keys";
import { iconForType } from "@/lib/session-type-icon";
import { cn } from "@/lib/utils";

export interface BookTypePickerProps {
  options: readonly BookOption[];
  /** La chiave (BookOption.key) della tipologia scelta, o null. */
  selectedKey: string | null;
  onSelect: (option: BookOption) => void;
  /** Una tipologia che non si sceglie: apre «Come si prenota». */
  onExplain: (option: BookOption) => void;
  /** Il titolo della sezione (tabIndex -1): lì torna il focus quando serve. */
  titleRef?: Ref<HTMLHeadingElement>;
}

export function BookTypePicker({
  options,
  selectedKey,
  onSelect,
  onExplain,
  titleRef,
}: BookTypePickerProps) {
  const selected = options.findIndex((o) => o.key === selectedKey && o.state === "prenotabile");
  const onKeyDown = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const target = segmentKeyTarget(e.key, index, options.length);
    if (target === null) return;
    e.preventDefault();
    const items = e.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLElement>("[data-type-option]");
    items?.[target]?.focus();
    const next = options[target];
    if (next && next.state === "prenotabile" && next.key !== selectedKey) onSelect(next);
  };

  return (
    <section className="flex flex-col gap-2.5">
      <h2 ref={titleRef} tabIndex={-1} className={CARD_TITLE}>
        Cosa vuoi prenotare?
      </h2>
      <div role="radiogroup" aria-label="Tipologia di sessione" className="flex flex-col gap-2">
        {options.map((o, i) => {
          const can = o.state === "prenotabile";
          const on = i === selected;
          const Icon = iconForType(o.name);
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={on}
              aria-disabled={can ? undefined : true}
              tabIndex={on || (selected < 0 && i === 0) ? 0 : -1}
              data-type-option
              onClick={() => {
                if (!can) onExplain(o);
                else if (!on) onSelect(o);
              }}
              onKeyDown={onKeyDown(i)}
              className={cn(
                "flex min-h-16 items-center gap-3 rounded-[18px] border-[1.5px] px-3.5 py-2.5 text-left",
                on
                  ? "border-primary-container bg-primary-container/6"
                  : "border-surface-variant bg-white",
              )}
            >
              <span
                aria-hidden
                className="grid size-10 shrink-0 place-items-center rounded-[12px]"
                style={{ background: typeTint(o.color), color: tileIcon(o.color) }}
              >
                <Icon className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                {/* Un nome di una parola lunga va a capo dentro la parola invece
                    di uscire dalla riga (passata 10). */}
                <span className="text-[15px] font-bold text-on-surface [overflow-wrap:anywhere]">
                  {o.name}
                </span>
                <span
                  className={cn(
                    "text-[13px] font-semibold",
                    o.state === "esaurita" ? "text-warning-ink" : "text-on-surface-variant",
                  )}
                >
                  {o.sub}
                </span>
              </span>
              {can ? (
                <span
                  aria-hidden
                  className={cn(
                    "grid size-[22px] shrink-0 place-items-center rounded-full border-2",
                    on ? "border-primary-container" : "border-outline-variant",
                  )}
                >
                  <span className={cn("size-2.5 rounded-full", on && "bg-primary-container")} />
                </span>
              ) : (
                <ChevronRight
                  className="size-[18px] shrink-0 text-on-surface-variant"
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
