// ----------------------------------------------------------------------------
// ClientNotificationsBell — campanella + pannello notifiche del cliente
// ----------------------------------------------------------------------------
// Design handoff (Client Dashboard): le voci sono DERIVATE dai dati già
// presenti in dashboard (sessione da confermare, sessioni da prenotare,
// ultima BIA, pool esauriti, feedback in sospeso) — non righe del DB. Lo
// stato "letto" è quindi solo UI e vive in localStorage per-utente, come
// nel prototipo (chiave ncnotif-read-*). Le notifiche server-side restano
// nella tabella notifications (campanella coach).
// ----------------------------------------------------------------------------

import { useState } from "react";
import { Bell, CalendarDays, ChartLine, Sparkles, MessageCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ClientNotificationKind = "confirm" | "block" | "bia" | "credit" | "feedback";

export interface ClientNotificationItem {
  id: string;
  kind: ClientNotificationKind;
  title: string;
  sub: string;
  onClick?: () => void;
}

const KIND_STYLE: Record<ClientNotificationKind, { color: string; Icon: typeof Bell }> = {
  confirm: { color: "#039be5", Icon: Bell },
  block: { color: "#ea580c", Icon: CalendarDays },
  bia: { color: "#0b8043", Icon: ChartLine },
  credit: { color: "#8e24aa", Icon: Sparkles },
  feedback: { color: "#4361ee", Icon: MessageCircle },
};

function readKey(userId: string) {
  return `nc-client-notif-read-${userId}`;
}

function readSet(userId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(readKey(userId)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function ClientNotificationsBell({
  userId,
  items,
}: {
  userId: string;
  items: ClientNotificationItem[];
}) {
  const [open, setOpen] = useState(false);
  // Bump per ri-renderizzare dopo markAllRead (localStorage non è reattivo).
  const [, setReadBump] = useState(0);

  const read = readSet(userId);
  const withUnread = items.map((it) => ({ ...it, unread: !read.includes(it.id) }));
  const unreadCount = withUnread.filter((x) => x.unread).length;

  const markAllRead = () => {
    try {
      localStorage.setItem(readKey(userId), JSON.stringify(items.map((x) => x.id)));
    } catch {
      // storage pieno/negato: il badge resta, nessun crash
    }
    setReadBump((n) => n + 1);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `Notifiche, ${unreadCount} non lette` : "Notifiche"}
          className="relative w-10 h-10 rounded-full bg-surface-container-lowest border border-outline-variant/40 grid place-items-center text-on-surface-variant active:scale-95 transition"
        >
          <Bell className="size-[18px]" aria-hidden />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-error-bright text-white text-[10px] font-bold flex items-center justify-center border-2 border-surface">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[330px] max-w-[calc(100vw-40px)] p-0 rounded-3xl border-outline-variant/40 shadow-[0_20px_60px_rgba(0,0,0,0.22)] overflow-hidden"
      >
        <div className="flex items-center justify-between px-[18px] py-4 border-b border-surface-container-low">
          <span className="font-display text-base font-bold text-on-surface">Notifiche</span>
          {withUnread.length > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-semibold text-primary-container"
            >
              Segna lette
            </button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {withUnread.length === 0 ? (
            <div className="px-[18px] py-8 text-center text-[13px] text-outline">
              Nessuna notifica
            </div>
          ) : (
            withUnread.map((it) => {
              const { color, Icon } = KIND_STYLE[it.kind];
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => {
                    markAllRead();
                    setOpen(false);
                    it.onClick?.();
                  }}
                  className="w-full text-left flex gap-3 px-[18px] py-3.5 border-b border-surface-container-low/60 transition-colors hover:bg-surface-container-low/50"
                  style={it.unread ? { background: "rgba(3,155,229,0.04)" } : undefined}
                >
                  <div
                    className="w-9 h-9 rounded-[10px] shrink-0 grid place-items-center"
                    style={{ background: `${color}1a`, color }}
                  >
                    <Icon className="size-[18px]" aria-hidden />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="m-0 text-[13px] font-bold text-on-surface">{it.title}</p>
                    <p className="m-0 mt-[3px] text-xs text-outline leading-snug">{it.sub}</p>
                  </div>
                  {it.unread && (
                    <span className="w-2 h-2 rounded-full bg-info-bia shrink-0 mt-1" aria-hidden />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
