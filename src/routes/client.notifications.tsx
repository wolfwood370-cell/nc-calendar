import { useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BellOff,
  CalendarCheck,
  Coins,
  Hourglass,
  Star,
  type LucideIcon,
} from "lucide-react";
import { ClientButton } from "@/components/client-button";
import { ClientPageHeader } from "@/components/client-page-header";
import { useClientShell } from "@/hooks/use-client-shell";
import type { ClientReminderItem, ClientReminderKind } from "@/lib/client-notifications";
import { clientPageTitle } from "@/lib/client-shell";
import { cn } from "@/lib/utils";

const DESCRIPTION = "I promemoria sulle tue sessioni e sui tuoi crediti.";

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

/** Icone e colori della passata 08, sulle voci di oggi. */
const KIND: Record<ClientReminderKind, { icon: LucideIcon; color: string }> = {
  confirm: { icon: CalendarCheck, color: "#c2410c" },
  block: { icon: Hourglass, color: "#c2410c" },
  credit: { icon: Coins, color: "#c2410c" },
  feedback: { icon: Star, color: "#b45309" },
  bia: { icon: Activity, color: "#039be5" },
};

/**
 * La pagina Notifiche (passata 01, audit H8 prima parte): le voci calcolate
 * di oggi (client-notifications.ts), nell'ordine di prima, con la riga della
 * passata 08 ma senza la riga del tempo (le voci di oggi non hanno una data
 * loro: la definisce la 08). Il tocco su una voce le segna lette tutte, come
 * il popover di prima, e se la voce porta da qualche parte ci va; dal
 * dettaglio, Indietro torna qui.
 */
function ClientNotificationsPage() {
  const { reminders, readIds, unread, markAllRead } = useClientShell();
  const navigate = useNavigate();
  const read = new Set(readIds);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  // «Segna tutte come lette» sparisce appena premuto: il focus va al
  // riepilogo, che è una regione live e dice «Tutte lette».
  const markAll = () => {
    markAllRead();
    summaryRef.current?.focus();
  };

  const open = (item: ClientReminderItem) => {
    markAllRead();
    const target = item.target;
    if (!target) return;
    if (target.to === "/client/bookings/$bookingId") {
      void navigate({ to: target.to, params: { bookingId: target.bookingId } });
    } else {
      void navigate({ to: target.to });
    }
  };

  return (
    <div className="bg-surface min-h-screen">
      <ClientPageHeader title="Notifiche" />
      <div className="flex flex-col gap-3 px-4 pt-2 pb-8">
        {reminders.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-1">
            <p
              ref={summaryRef}
              role="status"
              tabIndex={-1}
              className="text-sm text-on-surface-variant"
            >
              {unread > 0 ? `${unread} da leggere` : "Tutte lette"}
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
        )}

        {reminders.length === 0 ? (
          <section className="flex flex-col items-center gap-2 rounded-[24px] border border-outline-variant/35 bg-white px-5 py-6 text-center">
            <BellOff className="size-7 text-outline" aria-hidden />
            <p className="text-[17px] font-bold text-on-surface">Nessuna notifica</p>
            <p className="text-sm leading-normal text-on-surface-variant">
              Qui arrivano i promemoria sulle tue sessioni e sui tuoi crediti.
            </p>
          </section>
        ) : (
          <ul className="flex flex-col gap-2">
            {reminders.map((item) => {
              const isUnread = !read.has(item.id);
              const { icon: Icon, color } = KIND[item.kind];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => open(item)}
                    aria-label={`${isUnread ? "Non letta. " : ""}${item.title}. ${item.sub}`}
                    className={cn(
                      "flex min-h-[72px] w-full items-start gap-3 rounded-[18px] border p-3.5 text-left transition-colors",
                      isUnread
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
                        {item.sub}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "mt-1.5 size-2.5 shrink-0 rounded-full",
                        isUnread ? "bg-primary-container" : "bg-transparent",
                      )}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
