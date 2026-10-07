// ----------------------------------------------------------------------------
// TrainerNotificationsBell — bell icon + badge + list panel
// ----------------------------------------------------------------------------
// Wraps useNotifications + useMarkNotificationRead from
// src/hooks/use-notifications.ts. On mobile (<md) the panel is a bottom
// Sheet that opens /trainer/calendar. On desktop it's the «Attività clienti»
// Popover of the coach header: a row marks the notification read and opens
// the Calendar on the event's day with the event selected (audit S4).
// Un acquisto di Booster (booster.purchased, passata 06 del cliente) apre
// invece il profilo del cliente, da tutte e due. L'annullamento e il
// ripristino del cliente (booking.cancelled e booking.restored, giro del
// server del 07/10/2026) aprono il Calendario come una prenotazione.
// ----------------------------------------------------------------------------

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  CalendarCheck,
  CalendarPlus,
  CalendarX,
  CheckCheck,
  ChevronRight,
  Repeat,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  unreadCount,
  type NotificationRow,
} from "@/hooks/use-notifications";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/lib/query-keys";
import {
  describeMobileNotification,
  describeNotification,
  formatAgo,
  formatUnreadBadge,
  notificationsBellLabel,
  type NotificationView,
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
      {/* Design handoff: badge numerico non-lette (al posto del pallino muto).
          Fondo error come il badge del desktop: il bianco a 10 px su
          error-bright faceva 4,23:1, sotto il 4,5:1 del testo piccolo
          (contrast.test.ts, passata 10). */}
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center border-2 border-surface tabular-nums"
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
            className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-error px-1 text-[10px] font-bold text-white tabular-nums"
          >
            {formatUnreadBadge(unread)}
          </span>
        )}
      </button>
    );
  },
);

// ---- Desktop row -------------------------------------------------------

/** L'icona della riga: una per ogni kind di describeNotification. */
const KIND_ICON: Record<NotificationView["kind"], LucideIcon> = {
  created: CalendarPlus,
  rescheduled: Repeat,
  purchase: Sparkles,
  cancelled: CalendarX,
  restored: CalendarCheck,
  other: CalendarPlus,
};

function ActivityRow({ n, onOpen }: { n: NotificationRow; onOpen: () => void }) {
  const isUnread = n.read_at == null;
  const view = describeNotification(n);
  const Icon = KIND_ICON[view.kind];

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
          {formatAgo(n.created_at)} ·{" "}
          {view.kind === "purchase" ? "Apri il profilo" : "Apri nel calendario"}
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
  const { title, body } = describeMobileNotification(n);

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
  const qc = useQueryClient();
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

  // Un acquisto apre il profilo del cliente; il resto, il Calendario.
  const openProfile = (clientId: string) =>
    void navigate({ to: "/trainer/clients/$id", params: { id: clientId } });

  // Audit S4: il Calendario si apre sulla settimana dell'evento; `event` lo
  // usa il pannello dettagli della passata 04 per selezionarlo. Vale anche
  // dal telefono (handleItemClick, passata 10 del lato cliente: prima la
  // notifica apriva il Calendario senza data; quello del telefono legge già
  // ?date=). Un acquisto apre ancora il profilo.
  const openInCalendar = (n: NotificationRow) => {
    if (n.read_at == null) markRead.mutate(n.id);
    setPopoverOpen(false);
    const { date, bookingId, clientId } = describeNotification(n);
    if (clientId) {
      openProfile(clientId);
      return;
    }
    // La sessione della notifica può mancare dalla cache del Calendario già
    // aperto (prenotata, annullata o ripristinata dopo l'ultima lettura): si
    // rilegge, e l'effetto `event` del desktop aspetta il caricamento invece
    // di dire «Evento non trovato» o di mostrare lo stato vecchio.
    void qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(userId) });
    void navigate({
      to: "/trainer/calendar",
      search: date ? { date, event: bookingId ?? undefined } : {},
    });
  };

  // Telefono: lo stesso, chiudendo il foglio.
  const handleItemClick = (n: NotificationRow) => {
    setSheetOpen(false);
    openInCalendar(n);
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
            // Passata 12: l'ultima notifica sopra la zona del gesto, che con
            // viewport-fit=cover (__root.tsx) sul telefono vale 34 px, e i lati
            // fuori dal foro della fotocamera di un telefono in orizzontale.
            style={{
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
              paddingLeft: "env(safe-area-inset-left, 0px)",
              paddingRight: "env(safe-area-inset-right, 0px)",
            }}
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
