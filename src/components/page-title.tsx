import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * H1 delle pagine coach (audit T2): Sora 36/700, −0.02em, interlinea 1.15,
 * colore on-surface (utility `page-title` in styles.css). Sotto md scende a
 * 28px, per le pagine che non hanno un layout mobile separato.
 */
export function PageTitle({ className, ...props }: ComponentProps<"h1">) {
  return (
    <h1 className={cn("page-title text-on-surface max-md:text-[28px]", className)} {...props} />
  );
}
