import { useRef, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BellOff,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  Coins,
  Hourglass,
  Layers,
  Repeat,
  Rocket,
  Star,
  type LucideIcon,
} from "lucide-react";
import { BookRetryCard } from "@/components/book-blocked-card";
import { ClientButton } from "@/components/client-button";
import { ClientPageHeader } from "@/components/client-page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useClientShell } from "@/hooks/use-client-shell";
import { useMyCoach } from "@/hooks/use-my-coach";
import {
  emptyNotificationsText,
  notificationsSummary,
  type ClientNotificationItem,
  type ClientNotificationKind,
} from "@/lib/client-notifications";
import { clientPageTitle } from "@/lib/client-shell";
import { cn } from "@/lib/utils";

const DESCRIPTION = "I promemoria sulle tue sessioni e sui tuoi crediti, e gli avvisi del coach.";

export const Route = createFileRoute("/client/notifications")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Notifiche") },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: clientPageTitle("Notifiche") },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  component: ClientNotificationsPage,
});

/** Icone e colori del brief della 08: i promemoria e le azioni del coach. */
const KIND: Record<ClientNotificationKind, { icon: LucideIcon; color: string }> = {
  confirm: { icon: CalendarCheck, color: "#c2410c" },
  use: { icon: Hourglass, color: "#c2410c" },
  low: { icon: Coins, color: "#c2410c" },
  feedback: { icon: Star, color: "#b45309" },
  moved: { icon: Repeat, color: "#005685" },
  cancelled: { icon: CalendarX, color: "#b91c1c" },
  created: { icon: CalendarPlus, color: "#005685" },
  credits: { icon: Coins, color: "#047857" },
  renewed: { icon: Layers, color: "#047857" },
  path: { icon: Rocket, color: "#047857" },
  bia: { icon: Activity, color: "#039be5" },
};

/**
 * La pagina Notifiche (passate 01 e 08, audit H8): i promemoria e le azioni
 * del coach, dalla più recente, come li calcola la cornice
 * (client-notifications.ts, use-client-shell.ts); la pagina non conta niente.
 * Prima che arrivino tutte le letture da cui vengono le voci, lo scheletro; se
 * una è persa, la card con «Riprova». Il tocco su una voce segna letta solo
 * quella e apre la sua pagina, sempre con un push nella cronologia: dal
 * dettaglio, Indietro torna qui. «Segna tutte come lette» le segna tutte.
 */
function ClientNotificationsPage() {
  const {
    notifications,
    notificationsLoading,
    notificationsLost,
    retryNotifications,
    notificationsRetrying,
    unread,
    markRead,
    markAllRead,
  } = useClientShell();
  const { coach } = useMyCoach();
  const navigate = useNavigate();
  const summaryRef = useRef<HTMLParagraphElement>(null);

  // «Segna tutte come lette» sparisce appena premuto: il focus va al
  // riepilogo, che è una regione live e dice «Tutte lette».
  const markAll = () => {
    markAllRead();
    summaryRef.current?.focus();
  };

  const open = (item: ClientNotificationItem) => {
    markRead(item);
    const target = item.target;
    if (target.to === "/client/bookings/$bookingId") {
      void navigate({ to: target.to, params: { bookingId: target.bookingId } });
    } else {
      void navigate({ to: target.to });
    }
  };

  let content: ReactNode;
  if (notificationsLoading) {
    content = (
      <div className="flex flex-col gap-2" aria-hidden>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[72px] rounded-[18px]" />
        ))}
      </div>
    );
  } else if (notificationsLost) {
    content = (
      <BookRetryCard
        title="Le notifiche non si sono caricate"
        text="Non siamo riusciti a leggere le tue notifiche. Riprova tra poco."
        onRetry={retryNotifications}
        retrying={notificationsRetrying}
      />
    );
  } else if (notifications.length === 0) {
    content = (
      <section className="flex flex-col items-center gap-2 rounded-[24px] border border-outline-variant/35 bg-white px-5 py-6 text-center">
        <BellOff className="size-7 text-outline" aria-hidden />
        <p className="text-[17px] font-bold text-on-surface">Nessuna notifica</p>
        <p className="text-sm leading-normal text-on-surface-variant">
          {emptyNotificationsText(coach)}
        </p>
      </section>
    );
  } else {
    content = (
      <>
        <div className="flex items-center justify-between gap-3 px-1">
          <p
            ref={summaryRef}
            role="status"
            tabIndex={-1}
            className="text-sm text-on-surface-variant"
          >
            {notificationsSummary(unread)}
          </p>
          {unread > 0 && (
            <ClientButton
              variant="text"
              onClick={markAll}
              className="px-0 text-sm font-bold text-primary-container"
            >
              Segna tutte come lette
            </ClientButton>
          )}
        </div>
        <ul className="flex flex-col gap-2">
          {notifications.map((item) => {
            const { icon: Icon, color } = KIND[item.kind];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => open(item)}
                  aria-label={item.aria}
                  className={cn(
                    "flex min-h-[72px] w-full items-start gap-3 rounded-[18px] border p-3.5 text-left transition-colors",
                    item.unread
                      ? "border-primary-container/25 bg-white"
                      : "border-outline-variant/35 bg-white/55",
                  )}
                >
                  <span
                    className="grid size-10 shrink-0 place-items-center rounded-[12px]"
                    style={{ background: `${color}1a`, color }}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <span className="text-[15px] font-bold text-on-surface">{item.title}</span>
                    <span className="text-sm leading-[1.4] text-on-surface-variant">
                      {item.body}
                    </span>
                    {item.ago && (
                      <span className="text-xs text-on-surface-variant">{item.ago}</span>
                    )}
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-2.5 shrink-0 rounded-full",
                      item.unread ? "bg-primary-container" : "bg-transparent",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <div className="bg-surface min-h-screen">
      <ClientPageHeader title="Notifiche" />
      <div className="flex flex-col gap-3 px-4 pt-2 pb-8">{content}</div>
    </div>
  );
}
