// ----------------------------------------------------------------------------
// ClientButton — i pulsanti del cliente (lato cliente, passata 01, audit V4 e V7)
// ----------------------------------------------------------------------------
// Le varianti del brief, per tutte le passate del cliente:
//   - primary: 52, pieno #005685, 16/700; premuto #003e62; disabilitato
//     #e1e2e7 con testo #41474f; icona 18;
//   - secondary: 48, bordo #c1c7d0, testo #003e62 15/600; icona 16;
//   - tonal: 44 (size="md", 14/700) o 48 (size="lg", 15/700), fondo
//     primario al 10%, testo #003e62;
//   - text: 44, testo #003e62 15/600; text-danger: #b91c1c 15/700;
//   - danger: 52, pieno #b91c1c, 16/700 (solo il foglio di annullamento);
//   - row / row-outline: l'azione di riga, 44, padding 0 16, 14/700, piena o
//     col bordo.
// In ogni card o foglio al massimo un pulsante pieno (V4, V11). Il focus
// visibile (2px #005685, scostato di 2) è la regola globale di styles.css.
// components/ui/button.tsx resta com'è: lo usa il lato coach.
// ----------------------------------------------------------------------------

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type ClientButtonVariant =
  | "primary"
  | "secondary"
  | "tonal"
  | "text"
  | "text-danger"
  | "danger"
  | "row"
  | "row-outline";

export interface ClientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ClientButtonVariant;
  /** Solo per tonal: 44 px e 14/700 (md) o 48 px e 15/700 (lg). */
  size?: "md" | "lg";
  /** Icona Lucide prima del testo; la sua misura la dà la variante. */
  icon?: LucideIcon;
  /** A tutta larghezza, come nei fogli. */
  fullWidth?: boolean;
  /** Presta lo stile al figlio (un Link), senza icona. */
  asChild?: boolean;
}

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-full whitespace-nowrap select-none transition-colors disabled:cursor-not-allowed";

const VARIANT: Record<ClientButtonVariant, string> = {
  primary:
    "h-[52px] px-6 bg-primary-container text-white text-base font-bold active:bg-aura-primary disabled:bg-surface-variant disabled:text-on-surface-variant",
  secondary:
    "h-12 px-5 border border-outline-variant bg-transparent text-aura-primary text-[15px] font-semibold active:bg-primary-container/8 disabled:opacity-50",
  tonal:
    "bg-primary-container/10 text-aura-primary font-bold active:bg-primary-container/15 disabled:opacity-50",
  text: "h-11 px-3 bg-transparent text-aura-primary text-[15px] font-semibold active:bg-primary-container/8 disabled:opacity-50",
  "text-danger":
    "h-11 px-3 bg-transparent text-danger-text text-[15px] font-bold active:bg-danger-soft disabled:opacity-50",
  danger:
    "h-[52px] px-6 bg-danger-text text-white text-base font-bold active:opacity-90 disabled:bg-surface-variant disabled:text-on-surface-variant",
  row: "h-11 px-4 bg-primary-container text-white text-sm font-bold active:bg-aura-primary disabled:opacity-50",
  "row-outline":
    "h-11 px-4 border border-outline-variant bg-transparent text-aura-primary text-sm font-bold active:bg-primary-container/8 disabled:opacity-50",
};

const TONAL_SIZE = { md: "h-11 px-4 text-sm", lg: "h-12 px-5 text-[15px]" } as const;

const ICON_SIZE: Record<ClientButtonVariant, string> = {
  primary: "size-[18px]",
  danger: "size-[18px]",
  secondary: "size-4",
  tonal: "size-4",
  text: "size-4",
  "text-danger": "size-4",
  row: "size-4",
  "row-outline": "size-4",
};

export const ClientButton = forwardRef<HTMLButtonElement, ClientButtonProps>(function ClientButton(
  {
    variant = "primary",
    size = "md",
    icon: Icon,
    fullWidth = false,
    asChild = false,
    className,
    children,
    type,
    ...props
  },
  ref,
) {
  const classes = cn(
    BASE,
    VARIANT[variant],
    variant === "tonal" && TONAL_SIZE[size],
    fullWidth && "w-full",
    className,
  );
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={classes} {...props}>
      {Icon && <Icon className={ICON_SIZE[variant]} aria-hidden />}
      {children}
    </button>
  );
});
