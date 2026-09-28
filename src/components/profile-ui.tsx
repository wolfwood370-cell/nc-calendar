// ----------------------------------------------------------------------------
// Pezzi condivisi dai tab del Profilo desktop (passata 06)
// ----------------------------------------------------------------------------

import { sessionStatus, type StatusTone } from "@/lib/client-profile";
import { cn } from "@/lib/utils";

const TONE: Record<StatusTone, string> = {
  neutral: "bg-surface-container text-on-surface-variant",
  success: "bg-success-soft text-success-text",
  danger: "bg-danger-soft text-danger-text",
  warning: "bg-warning-soft text-warning-text",
  muted: "bg-surface-container-low text-on-surface-variant",
};

export function StatusChip({ status, small }: { status: string; small?: boolean }) {
  const s = sessionStatus(status);
  return (
    <span
      className={cn(
        "shrink-0 rounded-full font-bold",
        small ? "px-[7px] py-0.5 text-[10px]" : "px-2.5 py-[3px] text-[11px]",
        TONE[s.tone],
      )}
    >
      {s.label}
    </span>
  );
}
