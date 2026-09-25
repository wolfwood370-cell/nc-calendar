// ----------------------------------------------------------------------------
// TrainerNotificationsBell — bell icon + badge + list panel
// ----------------------------------------------------------------------------
// Wraps useNotifications + useMarkNotificationRead from
// src/hooks/use-notifications.ts. On mobile (<md) the panel is a bottom
// Sheet that opens /trainer/calendar. On desktop it's the «Attività clienti»
// Popover of the coach header: a row marks the notification read and opens
// the Calendar on the event's day with the event selected (audit S4).
// ----------------------------------------------------------------------------

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, CalendarPlus, CheckCheck, ChevronRight, Repeat } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  unreadCount,
  type NotificationRow,
} from "@/hooks/use-notifications";
import { useAuth } from "@/lib/auth";
import {
  describeNotification,
  formatAgo,
  formatUnreadBadge,
  isBookingCreatedPayload,
  isBookingRescheduledPayload,
  notificationsBellLabel,
} from "@/lib/notifications";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ---- Bell button (mobile trigger) --------------------------------------
// forwardRef so Radix Sheet/Popover Trigger asChild can attach its ref +
// open-handler props directly to the underlying <button>.

interface BellButtonProps extends React.ComponentPropsWithoutRef<"button"> {
  unread: number;
}
const BellButton = React.forwardRef<HTMLButtonElement, BellButtonProps>(function BellButton(
  { unread, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={unread > 0 ? `Notifiche (${unread} non lette)` : "Notifiche"}
      {...props}
      className={cn(
        // Design handoff: pulsante 38px bianco con bordo tenue, icona 18px
        "relative size-[38px] flex items-center justify-center rounded-full bg-white border border-outline-variant/40 text-on-surface-variant active:scale-95 transition-transform",
        className,
      )}
    >
      <Bell className="size-[18px]" />
      {/* Design handoff: badge numerico non-lette (al posto del pallino muto) */}
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-error-bright text-white text-[10px] font-bold flex items-center justify-center border-2 border-surface tabular-nums"
        >
          {unread}
        </span>
      )}
    </button>
  );
});

// ---- Desktop bell (header coach) ---------------------------------------
// Design handoff (Coach Header): 38px, badge 18px con «99+» oltre 99.

const DesktopBellButton = React.forwardRef<HTMLButtonElement, BellButtonProps>(
  function DesktopBellButton({ unread, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={notificationsBellLabel(unread)}
        {...props}
        className={cn(
          "relative grid size-[38px] shrink-0 place-items-center rounded-full border border-outline-variant/60 bg-white text-on-surface-variant transition-colors hover:text-aura-primary data-[state=open]:text-aura-primary",
          className,
        )}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-error-bright px-1 text-[10px] font-bold text-white tabular-nums"
          >
            {formatUnreadBadge(unread)}
          </span>
        )}
      </button>
    );
  },
);

// ---- Desktop row -------------------------------------------------------

function ActivityRow({ n, onOpen }: { n: NotificationRow; onOpen: () => void }) {
  const isUnread = n.read_at == null;
  const view = describeNotification(n);
  const Icon = view.kind === "rescheduled" ? Repeat : CalendarPlus;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 rounded-[14px] p-3 text-left transition-colors hover:bg-surface-container-low",
        isUnread && "bg-aura-primary/4",
      )}
    >
      <span
        aria-hidden
        className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-aura-primary/8 text-aura-primary"
      >
        <Icon className="size-[17px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {isUnread && <span className="sr-only">Non letta.</span>}
        <span className="text-[13px] font-bold text-on-surface">{view.title}</span>
        {view.body && <span className="text-xs text-on-surface-variant">{view.body}</span>}
        {view.when && <span className="text-xs text-on-surface-variant">{view.when}</span>}
        <span className="mt-0.5 text-[11px] text-outline">
          {formatAgo(n.created_at)} · Apri nel calendario
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          isUnread ? "bg-aura-primary" : "bg-transparent",
        )}
      />
    </button>
  );
}

function ActivityList({
  notifications,
  loading,
  onOpen,
}: {
  notifications: NotificationRow[] | undefined;
  loading: boolean;
  onOpen: (n: NotificationRow) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-0.5 p-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[92px] rounded-[14px] bg-surface-container-low animate-pulse" />
        ))}
      </div>
    );
  }
  if (!notifications || notifications.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-surface-container-low">
          <BellOff className="size-5 text-on-surface-variant" aria-hidden />
        </span>
        <p className="text-sm font-semibold text-on-surface">Nessuna notifica</p>
        <p className="text-xs text-on-surface-variant">
          Le nuove prenotazioni dei tuoi clienti compariranno qui.
        </p>
      </div>
    );
  }
  return (
    <div className="flex max-h-[420px] flex-col gap-0.5 overflow-y-auto p-1.5">
      {notifications.map((n) => (
        <ActivityRow key={n.id} n={n} onOpen={() => onOpen(n)} />
      ))}
    </div>
  );
}

// ---- Single row (mobile) -----------------------------------------------

function NotificationItem({ n, onClick }: { n: NotificationRow; onClick: () => void }) {
  const isUnread = n.read_at == null;
  const ago = formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: it });

  let title = "Notifica";
  let body = n.type;

  if (n.type === "booking.created" && isBookingCreatedPayload(n.payload)) {
    const p = n.payload;
    const when = format(new Date(p.scheduled_at), "EEE d MMM · HH:mm", { locale: it });
    title = "Nuova prenotazione";
    body = `${p.client_name} · ${p.session_label}\n${when}`;
  } else if (n.type === "booking.rescheduled" && isBookingRescheduledPayload(n.payload)) {
    const p = n.payload;
    const oldWhen = format(new Date(p.old_scheduled_at), "d MMM · HH:mm", { locale: it });
    const newWhen = format(new Date(p.new_scheduled_at), "d MMM · HH:mm", { locale: it });
    title = "Sessione spostata";
    body = `${p.client_name}\n${oldWhen} → ${newWhen}`;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left rounded-[24px] p-4 flex items-start gap-3 transition-colors active:scale-[0.99]",
        isUnread
          ? "bg-primary-container/30 hover:bg-primary-container/40"
          : "bg-surface-container-low hover:bg-surface-container",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "shrink-0 mt-1 w-2 h-2 rounded-full",
          isUnread ? "bg-primary" : "bg-transparent",
        )}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-on-surface">{title}</span>
        <span className="block text-xs text-on-surface-variant whitespace-pre-line mt-0.5">
          {body}
        </span>
        <span className="block text-[11px] text-on-surface-variant/70 mt-1">{ago}</span>
      </span>
      <ChevronRight className="size-4 text-outline mt-2 shrink-0" />
    </button>
  );
}

// ---- List body (mobile) ------------------------------------------------

function NotificationsList({
  notifications,
  loading,
  onItemClick,
  onMarkAllRead,
  canMarkAll,
}: {
  notifications: NotificationRow[] | undefined;
  loading: boolean;
  onItemClick: (n: NotificationRow) => void;
  onMarkAllRead: () => void;
  canMarkAll: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-3 px-4 py-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 rounded-[24px] bg-surface-container-low animate-pulse" />
        ))}
      </div>
    );
  }
  if (!notifications || notifications.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-3 px-6 py-12">
        <div className="w-14 h-14 rounded-full bg-surface-container-low grid place-items-center">
          <BellOff className="size-6 text-on-surface-variant" />
        </div>
        <p className="text-sm font-medium text-on-surface">Nessuna notifica</p>
        <p className="text-xs text-on-surface-variant">
          Le nuove prenotazioni dei tuoi clienti compariranno qui.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-2 px-4 pb-4">
        {notifications.map((n) => (
          <NotificationItem key={n.id} n={n} onClick={() => onItemClick(n)} />
        ))}
      </div>
      {canMarkAll && (
        <div className="px-4 pb-6">
          <button
            type="button"
            onClick={onMarkAllRead}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-full bg-surface-container-low text-sm font-semibold text-primary hover:bg-surface-container transition-colors"
          >
            <CheckCheck className="size-4" />
            Segna tutte come lette
          </button>
        </div>
      )}
    </>
  );
}

// ---- Public component --------------------------------------------------

export function TrainerNotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Sheet (mobile) e Popover (desktop) portalano entrambi in <body> a
  // prescindere dal wrapper `md:hidden` / `hidden md:block`: con un
  // singolo `open` condiviso il click sulla campanella apriva ANCHE il
  // widget del viewport opposto, il cui overlay/outside-click chiudeva
  // subito tutto — sintomo utente: "notifiche appaiono e spariscono".
  // Stato separato → solo il widget della fascia attiva reagisce.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [popoverOpen, setPopoverOpen] = React.useState(false);

  const userId = user?.id ?? null;
  const { data: notifications, isLoading } = useNotifications(userId);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = unreadCount(notifications);
  const canMarkAll = unread > 0;

  const handleItemClick = (n: NotificationRow) => {
    if (n.read_at == null) markRead.mutate(n.id);
    setSheetOpen(false);
    setPopoverOpen(false);
    void navigate({ to: "/trainer/calendar" });
  };

  // Audit S4 (desktop): il Calendario si apre sulla settimana dell'evento;
  // `event` lo userà il pannello dettagli della passata 04 per selezionarlo.
  const openInCalendar = (n: NotificationRow) => {
    if (n.read_at == null) markRead.mutate(n.id);
    setPopoverOpen(false);
    const { date, bookingId } = describeNotification(n);
    void navigate({
      to: "/trainer/calendar",
      search: date ? { date, event: bookingId ?? undefined } : {},
    });
  };

  const handleMarkAllRead = () => {
    if (canMarkAll) markAll.mutate();
  };

  const headerBadge = unread > 0 && (
    <span className="text-xs font-medium bg-primary-container text-on-primary-container px-2 py-0.5 rounded-full">
      {unread}
    </span>
  );

  return (
    <>
      {/* Mobile: bottom sheet */}
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <BellButton unread={unread} />
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-[32px] bg-surface-container-lowest border-t border-outline-variant/20 p-0 max-h-[80vh] overflow-y-auto"
          >
            <SheetHeader className="px-6 pt-6 pb-3 text-left">
              <SheetTitle className="text-lg font-semibold text-on-surface flex items-center gap-2">
                Notifiche
                {headerBadge}
              </SheetTitle>
            </SheetHeader>
            <NotificationsList
              notifications={notifications}
              loading={isLoading}
              onItemClick={handleItemClick}
              onMarkAllRead={handleMarkAllRead}
              canMarkAll={canMarkAll}
            />
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: popover «Attività clienti» dell'header coach */}
      <div className="hidden md:block">
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <DesktopBellButton unread={unread} />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            aria-label="Attività clienti"
            className="w-[360px] overflow-hidden rounded-[18px] border border-surface-container bg-white p-0 text-on-surface shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-surface-container-low px-[18px] py-3.5">
              <p className="font-display text-[15px] font-bold">Attività clienti</p>
              {canMarkAll && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs font-semibold text-primary-container hover:underline"
                >
                  Segna tutte come lette
                </button>
              )}
            </div>
            <ActivityList
              notifications={notifications}
              loading={isLoading}
              onOpen={openInCalendar}
            />
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
