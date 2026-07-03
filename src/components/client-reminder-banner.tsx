// ----------------------------------------------------------------------------
// ClientReminderBanner — promemoria "sessione entro 48h non confermata"
// ----------------------------------------------------------------------------
// Design handoff (Client Dashboard): banner gradiente #003e62→#005685 in cima
// alla dashboard con CTA "Conferma" che chiama la RPC di conferma presenza.
// Reso dal genitore SOLO quando la prossima sessione è entro 48 ore e
// client_confirmed_at è null.
// ----------------------------------------------------------------------------

import { Bell } from "lucide-react";
import { format, isToday, isTomorrow, differenceInCalendarDays } from "date-fns";
import { it } from "date-fns/locale";
import { useConfirmAttendance } from "@/hooks/use-confirm-attendance";

function relativeDay(d: Date): string {
  if (isToday(d)) return "oggi";
  if (isTomorrow(d)) return "domani";
  if (differenceInCalendarDays(d, new Date()) < 7) return format(d, "EEEE d", { locale: it });
  return format(d, "d MMM", { locale: it });
}

export function ClientReminderBanner({
  bookingId,
  clientId,
  scheduledAt,
  typeLabel,
}: {
  bookingId: string;
  clientId: string | null | undefined;
  scheduledAt: string;
  typeLabel: string;
}) {
  const confirm = useConfirmAttendance();
  const when = new Date(scheduledAt);

  return (
    <div
      className="rounded-3xl p-4 px-[18px] flex items-center gap-3.5 text-white shadow-[0_8px_30px_rgba(0,62,98,0.2)]"
      style={{ background: "linear-gradient(135deg,#003e62,#005685)" }}
    >
      <div className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center shrink-0">
        <Bell className="size-[22px] text-on-primary-container" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="m-0 text-sm font-bold">
          Promemoria: {relativeDay(when)} alle {format(when, "HH:mm")}
        </p>
        <p className="m-0 mt-[3px] text-xs text-white/75">{typeLabel} · conferma la tua presenza</p>
      </div>
      <button
        type="button"
        disabled={confirm.isPending}
        onClick={() => confirm.mutate({ bookingId, clientId })}
        className="shrink-0 bg-on-primary-container text-[#00344f] rounded-full px-4 py-[9px] text-xs font-bold active:scale-95 transition disabled:opacity-60"
      >
        Conferma
      </button>
    </div>
  );
}
