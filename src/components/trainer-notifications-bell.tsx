// ----------------------------------------------------------------------------
// TrainerNotificationsBell — bell icon + dot badge + list panel
// ----------------------------------------------------------------------------
// Wraps useNotifications + useMarkNotificationRead from
// src/hooks/use-notifications.ts. On mobile (<md) the panel is a bottom
// Sheet; on desktop it's a Popover anchored to the bell. Tapping a row
// marks it read and navigates to /trainer/calendar (deep-link to the
// booking's date is a future enhancement once the calendar route accepts
// a `date` search param).
// ----------------------------------------------------------------------------

import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, CheckCheck, ChevronRight } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  unreadCount,
  type NotificationRow,
  type BookingCreatedPayload,
  type BookingRescheduledPayload,
} from "@/hooks/use-notifications";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ---- Runtime payload shape checks --------------------------------------
// JSONB is structurally untyped — refuse to render anything we can't
// confidently shape-match, so a malformed payload degrades to a neutral
// "Notifica" row instead of crashing the bell.

function isBookingCreatedPayload(
  p: Record<string, unknown>,
): p is Record<string, unknown> & BookingCreatedPayload {
  return (
    typeof (p as { client_name?: unknown }).client_name === "string" &&
    typeof (p as { scheduled_at?: unknown }).scheduled_at === "string" &&
    typeof (p as { session_label?: unknown }).session_label === "string"
  );
}
function isBookingRescheduledPayload(
  p: Record<string, unknown>,
): p is Record<string, unknown> & BookingRescheduledPayload {
  return (
    typeof (p as { client_name?: unknown }).client_name === "string" &&
    typeof (p as { old_scheduled_at?: unknown }).old_scheduled_at === "string" &&
    typeof (p as { new_scheduled_at?: unknown }).new_scheduled_at === "string"
  );
}

// ---- Bell button (shared trigger) --------------------------------------
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
        "relative w-10 h-10 flex items-center justify-center rounded-full text-primary active:scale-95 transition-transform",
        className,
      )}
    >
      <Bell className="size-5" />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-destructive ring-2 ring-surface"
        />
      )}
    </button>
  );
});

// ---- Single row --------------------------------------------------------

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

// ---- Shared list body --------------------------------------------------

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
  const [open, setOpen] = React.useState(false);

  const userId = user?.id ?? null;
  const { data: notifications, isLoading } = useNotifications(userId);
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = unreadCount(notifications);
  const canMarkAll = unread > 0;

  const handleItemClick = (n: NotificationRow) => {
    if (n.read_at == null) markRead.mutate(n.id);
    setOpen(false);
    void navigate({ to: "/trainer/calendar" });
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
        <Sheet open={open} onOpenChange={setOpen}>
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

      {/* Desktop: popover */}
      <div className="hidden md:block">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <BellButton unread={unread} />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[380px] p-0 rounded-[28px] bg-surface-container-lowest border border-outline-variant/20 shadow-[0_12px_48px_rgba(0,0,0,0.12)]"
          >
            <div className="px-5 pt-5 pb-3 flex items-center gap-2">
              <span className="text-base font-semibold text-on-surface">Notifiche</span>
              {headerBadge}
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <NotificationsList
                notifications={notifications}
                loading={isLoading}
                onItemClick={handleItemClick}
                onMarkAllRead={handleMarkAllRead}
                canMarkAll={canMarkAll}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}
