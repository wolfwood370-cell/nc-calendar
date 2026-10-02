// ----------------------------------------------------------------------------
// ClientSwitch — l'interruttore del cliente (lato cliente, passata 07, audit R2)
// ----------------------------------------------------------------------------
// L'interruttore del brief: pista 52×32, accesa #005685 (primary-container) e
// spenta #c1c7d0 (outline-variant), pomello bianco di 26. Sui primitivi di
// Radix, quindi role="switch" e aria-checked; il nome accessibile lo dà chi lo
// usa (aria-labelledby verso l'etichetta della riga). L'area di tocco è di
// almeno 44 px (README, T2) anche se la pista è alta 32: un ::before
// invisibile sopra e sotto. Mentre lavora chi lo usa lo segna aria-disabled
// (non disabled: terrebbe il focus lontano), e qui ha lo stesso aspetto
// spento. Il focus visibile è la regola globale di styles.css.
// components/ui/switch.tsx resta com'è: lo usa il lato coach.
// ----------------------------------------------------------------------------

import * as SwitchPrimitives from "@radix-ui/react-switch";
import { forwardRef, type ComponentPropsWithoutRef, type ComponentRef } from "react";
import { cn } from "@/lib/utils";

export const ClientSwitch = forwardRef<
  ComponentRef<typeof SwitchPrimitives.Root>,
  ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(function ClientSwitch({ className, ...props }, ref) {
  return (
    <SwitchPrimitives.Root
      ref={ref}
      className={cn(
        "relative inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full p-[3px] transition-colors",
        "before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-['']",
        "data-[state=checked]:bg-primary-container data-[state=unchecked]:bg-outline-variant",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitives.Thumb className="pointer-events-none block size-[26px] rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitives.Root>
  );
});
