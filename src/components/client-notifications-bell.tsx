// ----------------------------------------------------------------------------
// ClientNotificationsBell — la campanella del cliente (lato cliente, passata 01)
// ----------------------------------------------------------------------------
// Apre la pagina Notifiche (/client/notifications), che dalla passata 01
// sostituisce il popover (audit H8, prima parte). Il numero delle non lette
// arriva dalla cornice del cliente (useClientShell): le voci e lo stato
// «letta» sono in un posto solo, così la campanella dell'header desktop, che
// resta montata, perde il badge appena la pagina Notifiche segna tutto letto.
// 44×44, tonda, bordo 1px rgba(193,199,208,0.6), icona Bell 20; badge rosso
// solo con voci non lette, «99+» oltre 99.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useClientShell } from "@/hooks/use-client-shell";
import { formatUnreadBadge, notificationsBellLabel } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export function ClientNotificationsBell({ className }: { className?: string }) {
  const { unread } = useClientShell();
  return (
    <Link
      to="/client/notifications"
      aria-label={notificationsBellLabel(unread)}
      className={cn(
        "relative grid size-11 shrink-0 place-items-center rounded-full border border-outline-variant/60 bg-white text-on-surface-variant transition-transform active:scale-95",
        className,
      )}
    >
      <Bell className="size-5" aria-hidden />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-[3px] -right-[3px] flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-error-bright px-[5px] text-xs leading-none font-bold text-white"
        >
          {formatUnreadBadge(unread)}
        </span>
      )}
    </Link>
  );
}
