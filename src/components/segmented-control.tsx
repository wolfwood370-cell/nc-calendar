// ----------------------------------------------------------------------------
// Controllo segmentato (audit O3)
// ----------------------------------------------------------------------------
// Gruppo di pulsanti mutuamente esclusivi con role="radiogroup"/"radio",
// navigabile con le frecce, Home ed End (Radix RadioGroup). Aspetto del
// prototipo: pista surface-container, segmento scelto bianco con ombra.
// ----------------------------------------------------------------------------

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(v) => onChange(v as T)}
      orientation="horizontal"
      loop
      aria-label={ariaLabel}
      data-segmented
      className={cn("flex rounded-full bg-surface-container p-[3px]", className)}
    >
      {options.map((o) => (
        <RadioGroupPrimitive.Item
          key={o.value}
          value={o.value}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
            "data-[state=checked]:bg-white data-[state=checked]:text-aura-primary data-[state=checked]:shadow-[0_1px_3px_rgba(0,0,0,0.1)]",
            "data-[state=unchecked]:text-on-surface-variant data-[state=unchecked]:hover:text-on-surface",
          )}
        >
          {o.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
