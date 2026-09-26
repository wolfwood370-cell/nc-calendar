// ----------------------------------------------------------------------------
// Guscio dei dialog del redesign coach (passata 02)
// ----------------------------------------------------------------------------
// Misure del README del pacchetto: overlay rgba(25,28,31,0.32); dialog radius
// 28, padding 28, titolo Sora 22/700; dialog di conferma radius 24, padding
// 24, titolo Sora 19/700; ombra 0 30px 80px rgba(0,0,0,0.25); pulsanti 40px.
// Lo usano i dialog condivisi (Assegna evento, Pacchetto, Annulla o elimina
// sessione) e le passate successive.
// ----------------------------------------------------------------------------

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const OVERLAY =
  "fixed inset-0 z-50 bg-[rgba(25,28,31,0.32)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0";

const PANEL =
  "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-48px)] w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto bg-surface-container-lowest text-on-surface shadow-[0_30px_80px_rgba(0,0,0,0.25)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95";

/** Pulsante secondario dei dialog («Annulla», «Indietro»). */
export const dialogSecondaryButton =
  "inline-flex h-10 items-center justify-center rounded-full bg-surface-container px-[18px] text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-variant disabled:opacity-60";

/** Pulsante primario dei dialog; grigio da disabilitato. */
export const dialogPrimaryButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-aura-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-container disabled:bg-outline-variant disabled:hover:bg-outline-variant";

/** Pulsante rosso delle azioni distruttive. */
export const dialogDangerButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-danger-text px-[18px] text-sm font-semibold text-white transition-colors hover:bg-danger-text/90 disabled:opacity-60";

export const CoachDialog = DialogPrimitive.Root;

/** Contenuto del dialog: larghezza dal chiamante (es. `sm:max-w-[560px]`). */
export const CoachDialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className={OVERLAY} />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(PANEL, "rounded-[28px] p-7", className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
CoachDialogContent.displayName = "CoachDialogContent";

/** Titolo, righe descrittive (in `description`) e ✕ «Chiudi». */
export function CoachDialogHeader({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <DialogPrimitive.Title className="font-display text-[22px] font-bold leading-tight text-on-surface">
          {title}
        </DialogPrimitive.Title>
        {description && (
          <DialogPrimitive.Description asChild>
            <div className="flex flex-col gap-1">{description}</div>
          </DialogPrimitive.Description>
        )}
        {children}
      </div>
      <DialogPrimitive.Close
        aria-label="Chiudi"
        className="grid size-9 shrink-0 place-items-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
      >
        <X className="size-[18px]" aria-hidden />
      </DialogPrimitive.Close>
    </div>
  );
}

export const CoachAlertDialog = AlertDialogPrimitive.Root;

/** Dialog di conferma: 460px, radius 24, padding 24. */
export const CoachAlertDialogContent = forwardRef<
  ElementRef<typeof AlertDialogPrimitive.Content>,
  ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className={OVERLAY} />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(PANEL, "gap-3.5 rounded-[24px] p-6 sm:max-w-[460px]", className)}
      {...props}
    >
      {children}
    </AlertDialogPrimitive.Content>
  </AlertDialogPrimitive.Portal>
));
CoachAlertDialogContent.displayName = "CoachAlertDialogContent";

export function CoachAlertDialogTitle({ children }: { children: ReactNode }) {
  return (
    <AlertDialogPrimitive.Title className="font-display text-[19px] font-bold leading-tight text-on-surface">
      {children}
    </AlertDialogPrimitive.Title>
  );
}

export const CoachAlertDialogDescription = AlertDialogPrimitive.Description;
export const CoachAlertDialogCancel = AlertDialogPrimitive.Cancel;
