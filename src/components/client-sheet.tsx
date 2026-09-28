// ----------------------------------------------------------------------------
// ClientSheet — il foglio dal basso del cliente (lato cliente, passata 01)
// ----------------------------------------------------------------------------
// Uno per tutti i fogli del cliente (Sposta, Annulla, riepiloghi, password,
// installazione, «Come si prenota»), sui primitivi di vaul e non su
// components/ui/drawer.tsx, che ha lo scrim nero all'80% e una maniglia larga
// 100 px e resta a reschedule-drawer.tsx. Tre cose che vaul 1.1.2 e Radix
// Dialog 1.1.15 non fanno da soli:
//   - aria-modal: Radix non lo scrive (nasconde il resto con aria-hidden);
//   - il focus all'apertura: vaul ha autoFocus spento e annulla quello di
//     Radix, e il focus resterebbe sul pulsante fuori dal foglio, che Radix
//     intanto nasconde. Qui entra nel pannello, non in un campo (niente
//     tastiera che si apre da sola);
//   - il focus alla chiusura: Radix lo rende solo al suo Trigger, e con `open`
//     controllato quel riferimento è vuoto. Qui torna a chi aveva il focus
//     quando il foglio si è aperto.
// Si chiude col tocco sullo scrim, con Esc e trascinando in basso. Per le
// conferme distruttive role="alertdialog". I pulsanti vanno a tutta
// larghezza, in colonna (ClientButton con fullWidth): principale,
// secondario, testuale.
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
          }}
          style={{ paddingBottom: "max(24px, calc(env(safe-area-inset-bottom) + 12px))" }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-[560px] flex-col overflow-y-auto rounded-t-[28px] bg-white px-5 pt-2.5 text-on-surface outline-none",
            list ? "gap-4" : "gap-3.5",
            className,
          )}
        >
          <div
            aria-hidden
            className="mx-auto h-[5px] w-10 shrink-0 rounded-full bg-outline-variant"
          />
          <Drawer.Title className="font-display text-[22px] leading-tight font-bold tracking-[-0.01em]">
            {title}
          </Drawer.Title>
          {description ? (
            <Drawer.Description className="text-[15px] leading-normal text-on-surface-variant">
              {description}
            </Drawer.Description>
          ) : null}
          {children}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
