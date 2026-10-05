// ----------------------------------------------------------------------------
// Le card dello Store (lato cliente, passata 06, audit S1, S2, S4, S5, V14)
// ----------------------------------------------------------------------------
//   - StoreLockCard: chi non compra (S5), solo la spiegazione e, col link del
//     coach, il pulsante WhatsApp; nessun prodotto, nessun pulsante spento;
//   - StoreValidityBox: fino a quando valgono i Booster comprati oggi (S1);
//   - StoreBoughtCard: «Acquistati in questo blocco», i pagamenti del blocco;
//   - StoreProductCard: un pacchetto, col numero di crediti nel titolo,
//     «Più conveniente» solo dove è vero e «Acquista», l'unico pulsante pieno
//     della card, descritto dal titolo del prodotto (S2, S4);
//   - StoreEmptyCard: al posto dei prodotti, quando non ce n'è nessuno.
// Testi e condizioni arrivano fatti da client-store.ts; i colori della
// tipologia arrivano dai dati, nello style. Card bianche, raggio 24.
// ----------------------------------------------------------------------------

import { Info, MessageCircle, Sparkles } from "lucide-react";
import { useId, type Ref } from "react";
import { ClientButton } from "@/components/client-button";
import { typeTint } from "@/lib/client-book";
import { tileIcon } from "@/lib/client-session-detail";
import type { StoreBoughtRow, StoreLock, StoreProduct } from "@/lib/client-store";
import { CARD_TITLE, SANS_HEADING } from "@/lib/client-type";
import { iconForType } from "@/lib/session-type-icon";
import { cn } from "@/lib/utils";

const CARD = "rounded-[24px] border border-outline-variant/35 bg-white";

export interface StoreLockCardProps {
  lock: StoreLock;
  /** Il titolo (tabIndex -1): lì torna il focus quando il riepilogo si chiude da solo (V12). */
  titleRef?: Ref<HTMLHeadingElement>;
}

export function StoreLockCard({ lock, titleRef }: StoreLockCardProps) {
  return (
    <section className={cn(CARD, "flex flex-col gap-3 p-5")}>
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-[14px] bg-primary-container/10 text-primary-container"
      >
        <Sparkles className="size-6" />
      </span>
      <h2 ref={titleRef} tabIndex={-1} className={CARD_TITLE}>
        {lock.title}
      </h2>
      <p className="text-[15px] leading-normal text-on-surface-variant">{lock.text}</p>
      {lock.whatsapp && (
        <ClientButton asChild fullWidth>
          <a href={lock.whatsapp.href} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-[18px]" aria-hidden />
            {lock.whatsapp.label}
          </a>
        </ClientButton>
      )}
    </section>
  );
}

export function StoreValidityBox({ text }: { text: string }) {
  return (
    <section className="flex items-start gap-3 rounded-[18px] bg-primary-container/7 px-4 py-3.5">
      <Info className="mt-0.5 size-[18px] shrink-0 text-primary-container" aria-hidden />
      <p className="text-sm leading-normal text-on-surface">{text}</p>
    </section>
  );
}

export function StoreBoughtCard({ rows }: { rows: readonly StoreBoughtRow[] }) {
  return (
    <section className={cn(CARD, "flex flex-col gap-2.5 px-4 py-3.5")}>
      <h2 className={`${SANS_HEADING} text-[15px] font-bold`}>Acquistati in questo blocco</h2>
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">{row.label}</span>
            <span className="text-on-surface-variant tabular-nums">{row.meta}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface StoreProductCardProps {
  product: StoreProduct;
  onBuy: () => void;
}

export function StoreProductCard({ product, onBuy }: StoreProductCardProps) {
  const titleId = useId();
  const Icon = iconForType(product.typeName);
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        "relative flex flex-col gap-3 rounded-[24px] border-[1.5px] bg-white p-[18px] shadow-soft-card",
        product.highlighted ? "border-primary-container" : "border-outline-variant/35",
      )}
    >
      {product.best && (
        <span className="absolute -top-[11px] right-[18px] rounded-full bg-aura-primary px-2.5 py-[3px] text-xs font-bold text-white">
          Più conveniente
        </span>
      )}
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-[14px]"
          style={{ background: typeTint(product.color), color: tileIcon(product.color) }}
        >
          <Icon className="size-[22px]" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={titleId} className={CARD_TITLE}>
            {product.title}
          </h2>
          {product.description && (
            <p className="text-sm leading-[1.45] text-on-surface-variant">{product.description}</p>
          )}
          <p className="text-[13px] text-on-surface-variant">{product.meta}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-2xl font-bold tabular-nums">{product.price}</span>
          <span className="text-[13px] text-on-surface-variant">{product.per}</span>
        </div>
        <ClientButton
          aria-describedby={titleId}
          onClick={onBuy}
          className="h-12 px-[22px] text-[15px]"
        >
          Acquista
        </ClientButton>
      </div>
    </article>
  );
}

export function StoreEmptyCard({ text }: { text: string }) {
  return (
    <section className={cn(CARD, "p-5")}>
      <p className="text-[15px] leading-normal text-on-surface-variant">{text}</p>
    </section>
  );
}
