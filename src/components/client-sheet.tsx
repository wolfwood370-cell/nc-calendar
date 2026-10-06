// ----------------------------------------------------------------------------
// ClientSheet — il foglio dal basso del cliente (lato cliente, passata 01)
// ----------------------------------------------------------------------------
// Uno per tutti i fogli del cliente (Sposta, Annulla, riepiloghi, password,
// installazione, «Come si prenota»), sui primitivi di vaul e non su
// components/ui/drawer.tsx, che ha lo scrim nero all'80% e una maniglia larga
// 100 px (resta nel kit di ui/, ma non lo importa più nessuno). Tre cose che
// vaul 1.1.2 e Radix Dialog 1.1.15 non fanno da soli:
//   - aria-modal: Radix non lo scrive (nasconde il resto con aria-hidden);
//   - il focus all'apertura: vaul ha autoFocus spento e annulla quello di
//     Radix, e il focus resterebbe sul pulsante fuori dal foglio, che Radix
//     intanto nasconde. Qui entra nel pannello, non in un campo (niente
//     tastiera che si apre da sola);
//   - il focus alla chiusura: Radix lo rende solo al suo Trigger, e con `open`
//     controllato quel riferimento è vuoto. Qui torna a chi aveva il focus
//     quando il foglio si è aperto.
//     Se intanto è sparito, va dove dice returnFocus (passata 02).
// Si chiude col tocco sullo scrim, con Esc e trascinando in basso. Per le
// conferme distruttive role="alertdialog". I pulsanti vanno a tutta
// larghezza, in colonna (ClientButton con fullWidth): principale,
// secondario, testuale.
// Scorre dentro, non il pannello: vaul appende al pannello un ::after alto il
// 200% (lo sfondo che copre il vuoto quando lo si tira in su), e un pannello
// scorrevole scorrerebbe anche in quel bianco (misurato: 1176 px su 392). Con
// overflow hidden il pannello resta «scorrevole» per shouldDrag di vaul, che
// così riconosce role="dialog" e lascia trascinare anche a pagina scorsa. Con
// role="alertdialog" shouldDrag non si ferma sul pannello (cerca solo
// "dialog") e, a pagina scorsa, fuori da Safari il trascinamento non parte:
// chiudono Esc, lo scrim e i pulsanti.
// ----------------------------------------------------------------------------

import { useRef, type ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "@/lib/utils";

export interface ClientSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Il testo sotto il titolo, collegato con aria-describedby. */
  description?: ReactNode;
  /** "alertdialog" per le conferme distruttive. */
  role?: "dialog" | "alertdialog";
  /** Negli elenchi la colonna ha gap 16 invece di 14. */
  list?: boolean;
  className?: string;
  children?: ReactNode;
  /** Sopra il titolo, decorativa (aria-hidden): il riquadro dell'esito di Prenota. */
  icon?: ReactNode;
  /**
   * Dove va il focus alla chiusura quando chi ha aperto il foglio non c'è più
   * (in Prenota «Continua» sparisce con la prenotazione): senza, resterebbe sul body.
   */
  returnFocus?: () => HTMLElement | null | undefined;
}

export function ClientSheet({
  open,
  onOpenChange,
  title,
  description,
  role = "dialog",
  list = false,
  className,
  children,
  icon,
  returnFocus,
}: ClientSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <Drawer.Content
          ref={panelRef}
          role={role}
          aria-modal="true"
          // Senza descrizione niente aria-describedby verso un id che non esiste.
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            const active = document.activeElement;
            openerRef.current =
              active instanceof HTMLElement && active !== document.body ? active : null;
            panelRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const opener = openerRef.current;
            openerRef.current = null;
            if (opener?.isConnected) opener.focus({ preventScroll: true });
            else returnFocus?.()?.focus({ preventScroll: true });
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[28px] bg-white pt-2.5 text-on-surface outline-none",
            className,
          )}
        >
          <div
            aria-hidden
            className="mx-auto h-[5px] w-10 shrink-0 rounded-full bg-outline-variant"
          />
          <div
            className={cn(
              "flex min-h-0 flex-col overflow-y-auto px-5",
              list ? "gap-4 pt-4" : "gap-3.5 pt-3.5",
            )}
            style={{ paddingBottom: "max(24px, calc(env(safe-area-inset-bottom) + 12px))" }}
          >
            {icon}
            <Drawer.Title className="font-display text-[22px] leading-tight font-bold tracking-[-0.01em]">
              {title}
            </Drawer.Title>
            {description ? (
              <Drawer.Description className="text-[15px] leading-normal text-on-surface-variant">
                {description}
              </Drawer.Description>
            ) : null}
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
