// ----------------------------------------------------------------------------
// Avviso di data e ora dei dialog delle sessioni (audit V7, passata 10)
// ----------------------------------------------------------------------------
// Lo stesso riquadro arancione nel dialog del Calendario (session-form-dialog)
// e in quello del Profilo (profile-session-dialog); il testo viene da
// scheduleWarning (calendar-time.ts).
// ----------------------------------------------------------------------------

import { TriangleAlert } from "lucide-react";

export function ScheduleWarning({ text }: { text: string }) {
  return (
    <p
      role="status"
      className="flex items-start gap-2 rounded-[14px] bg-warning-soft px-3 py-2.5 text-[13px] leading-[1.45] text-warning-text"
    >
      <TriangleAlert className="mt-0.5 size-[15px] shrink-0" aria-hidden />
      {text}
    </p>
  );
}
