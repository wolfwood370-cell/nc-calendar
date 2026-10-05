import { useEffect, useRef, type ReactNode } from "react";
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
import { focusIfLost } from "@/lib/focus";
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

/**
 * Icone e colori del brief della 08: i promemoria e le azioni del coach. Dalla
 * 09 i colori sono i token del tema, col fondo al 10% (lo stesso colore con
 * l'opacità di Tailwind, cioè color-mix), invece degli esadecimali scritti
 * qui; la BIA ha il suo token più scuro (info-bia-text, styles.css), perché il
 * colore del brief sul suo fondo resta sotto il 3:1 delle icone.
 */
const WARNING = "bg-warning-text/10 text-warning-text";
const PRIMARY = "bg-primary-container/10 text-primary-container";
const SUCCESS = "bg-success-text/10 text-success-text";
const KIND: Record<ClientNotificationKind, { icon: LucideIcon; tile: string }> = {
  confirm: { icon: CalendarCheck, tile: WARNING },
  use: { icon: Hourglass, tile: WARNING },
  low: { icon: Coins, tile: WARNING },
  feedback: { icon: Star, tile: "bg-rating-star-line/10 text-rating-star-line" },
  moved: { icon: Repeat, tile: PRIMARY },
  cancelled: { icon: CalendarX, tile: "bg-danger-text/10 text-danger-text" },
  created: { icon: CalendarPlus, tile: PRIMARY },
  credits: { icon: Coins, tile: SUCCESS },
  renewed: { icon: Layers, tile: SUCCESS },
  path: { icon: Rocket, tile: SUCCESS },
  bia: { icon: Activity, tile: "bg-info-bia-text/10 text-info-bia-text" },
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

  // «Riprova»: mentre rilegge il focus resta sul pulsante (aria-disabled, non
  // disabled: il browser non glielo toglie). Se la rilettura fallisce di nuovo
  // lo prende il titolo della card, che lo annuncia; se riesce, la card sparisce
  // col pulsante, e il focus va al riepilogo (una regione live: «3 da
  // leggere») o, senza voci, a «Nessuna notifica». Come Sessioni e la Home.
  // Solo se il focus si era perso o era ancora nella card (passata 09):
  // toccato fuori rete, la rilettura aspetta la rete, e chi intanto è andato
  // altrove resta dov'è.
  const lostTitleRef = useRef<HTMLHeadingElement>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const retried = useRef(false);
  const retry = () => {
    retried.current = true;
    retryNotifications();
  };
  useEffect(() => {
    if (!retried.current || notificationsRetrying || notificationsLoading) return;
    retried.current = false;
    if (notificationsLost) {
      const title = lostTitleRef.current;
      focusIfLost(title, null, title?.parentElement);
    } else {
      focusIfLost(summaryRef.current ?? emptyRef.current);
    }
  }, [notificationsRetrying, notificationsLoading, notificationsLost]);

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
        onRetry={retry}
        retrying={notificationsRetrying}
        titleRef={lostTitleRef}
      />
    );
  } else if (notifications.length === 0) {
    content = (
      <section className="flex flex-col items-center gap-2 rounded-[24px] border border-outline-variant/35 bg-white px-5 py-6 text-center">
        <BellOff className="size-7 text-outline" aria-hidden />
        <p ref={emptyRef} tabIndex={-1} className="text-[17px] font-bold text-on-surface">
          Nessuna notifica
        </p>
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
            const { icon: Icon, tile } = KIND[item.kind];
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
                    className={cn("grid size-10 shrink-0 place-items-center rounded-[12px]", tile)}
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
