// ----------------------------------------------------------------------------
// Guscio delle pagine desktop del coach (audit V9, passata 10)
// ----------------------------------------------------------------------------
// Il <main> del layout /trainer ha 24px di padding (trainer.tsx, `md:p-6`),
// che le route del telefono usano ancora. Le sette pagine desktop lo annullano
// qui e prendono le misure del README: padding 28 · 40 · 48, e 120 in basso
// nelle pagine con la barra di salvataggio fissa (Disponibilità, Profilo).
// ----------------------------------------------------------------------------

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CoachPage({
  saveBar = false,
  className,
  children,
}: {
  /** La pagina ha la barra fissa «Modifiche non salvate»: 120px in basso. */
  saveBar?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-coach-page
      className={cn(
        "-m-6 min-h-[calc(100vh-3.5rem)] min-w-0 bg-surface px-10 pt-7 text-on-surface",
        saveBar ? "pb-[120px]" : "pb-12",
        className,
      )}
    >
      {children}
    </div>
  );
}
