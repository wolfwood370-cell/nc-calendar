import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { AuraCardSkeleton, AuraLineSkeleton } from "@/components/ui/aura-skeleton";
import { sessionLabel } from "@/lib/mock-data";
import type { BookingRow, ProfileRow, EventTypeRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// Heuristic detection for Google Calendar all-day events (birthdays,
// anniversaries, holidays). sync-calendar normalizes Google's
// `start.date` (date-only, no time) to `"<yyyy-MM-dd>T00:00:00Z"`, so
// the `Z`-suffixed midnight pattern is the marker. A regular event
// scheduled at midnight Italy time would be saved as
// `"...T22:00:00+00:00"` after conversion, so the false-positive risk
// is low for the Italy-based business timezone the app is built for.
export function isAllDayEvent(b: { scheduled_at: string }): boolean {
  return /T00:00:00(?:\.000)?Z$/i.test(b.scheduled_at);
}

// 🎂 for birthday-like all-day events, 🎉 for everything else. Keeps
// the strip glanceable at a tiny size where text alone gets noisy.
function allDayIcon(b: { title: string | null; notes: string | null }): string {
  const haystack = `${b.title ?? ""} ${b.notes ?? ""}`.toLowerCase();
  if (/compleanno|birthday|anniversario|anniversary/.test(haystack)) return "🎂";
  return "🎉";
}

export const IMPORT_PREFIX = /^Importato da Google Calendar:\s*/i;

// Shared label resolver for all-day cards: same precedence as
// personalBlockTitle (Google title → notes → stripped notes), but the
// generic fallback is more descriptive for the all-day strip context.
function allDayLabel(b: { title: string | null; notes: string | null }): string {
  const fromTitle = b.title?.trim();
  if (fromTitle) return fromTitle;
  const rawNotes = b.notes?.trim();
  if (rawNotes) {
    const stripped = rawNotes.replace(IMPORT_PREFIX, "").trim();
    if (stripped) return stripped;
    return rawNotes;
  }
  return "Evento giornaliero";
}

// Reusable pill for the desktop strip and the mobile pinned-top section.
// `compact` collapses to a tighter footprint for the desktop weekly grid
// where horizontal real estate per day is scarce.
export function AllDayPill({ booking, compact = false }: { booking: BookingRow; compact?: boolean }) {
  const label = allDayLabel(booking);
  const icon = allDayIcon(booking);
  return (
    <div
      title={label}
      // Aura secondary-container — soft blue that reads as "informational
      // event" against the white calendar surface. Distinct from the
      // muted neutrals of personal blocks and the warning-container
      // yellow of unassigned events. Spec'd per the design system pass.
      className={cn(
        "rounded-full bg-secondary-container text-on-secondary-container flex items-center gap-1.5 truncate",
        compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs",
      )}
    >
      <span aria-hidden="true" className="leading-none">
        {icon}
      </span>
      <span className="truncate font-medium">{label}</span>
    </div>
  );
}

// Resolve the most informative label for a personal block. Source order:
//   1. b.title — populated by sync-calendar from Google Calendar event.summary
//      for every imported event, so this is the original Google title
//      ("Dentista") when the personal block was converted from a Google event.
//   2. The raw notes — covers legacy/manual bookings where title may be empty.
//   3. The notes stripped of the "Importato da Google Calendar:" prefix —
//      keeps the human-readable title even if the import prefix is all that
//      survived.
//   4. Generic "Impegno personale" fallback for the (rare) case where no
//      source carried a meaningful label.
// Anything that resolves to a non-empty trimmed string wins; the function
// never returns "" or null, so callers can render it directly.
export function personalBlockTitle(b: { title: string | null; notes: string | null }): string {
  const fromTitle = b.title?.trim();
  if (fromTitle) return fromTitle;
  const rawNotes = b.notes?.trim();
  if (rawNotes) {
    const stripped = rawNotes.replace(IMPORT_PREFIX, "").trim();
    if (stripped) return stripped;
    return rawNotes;
  }
  return "Impegno personale";
}

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ----------------------------------------------------------------------------
// Mobile Agenda View (audit finding H5)
// ----------------------------------------------------------------------------
// Replaces the 7-column desktop grid on <md screens with a single-day agenda:
//   - horizontal pill scroller for day selection
//   - vertical list of event cards using the Aura Health card shape
// Tapping an event card delegates to the same handlers the desktop grid uses
// (Assign dialog for unassigned events, focus client for certified bookings),
// so the action surface is identical across breakpoints.

interface MobileAgendaViewProps {
  weekDays: Date[];
  // Two buckets, mirroring the desktop split. The mobile agenda renders
  // allDay events pinned at the top of the day's list (no time label,
  // tertiary-container pills), then the timed events sorted by hour.
  timedByDay: BookingRow[][];
  allDayByDay: BookingRow[][];
  clientsMap: Map<string, ProfileRow>;
  eventTypesMap: Map<string, EventTypeRow>;
  today: Date;
  /** First-load flag from useCoachBookings so we can paint Aura
      skeletons instead of the empty-state placeholder. */
  isLoading: boolean;
  onSelectAssign: (b: BookingRow) => void;
  onSelectClient: (clientId: string) => void;
}

export function MobileAgendaView({
  weekDays,
  timedByDay,
  allDayByDay,
  clientsMap,
  eventTypesMap,
  today,
  isLoading,
  onSelectAssign,
  onSelectClient,
}: MobileAgendaViewProps) {
  // Default to today's index within the visible week; fall back to Monday.
  const todayIdx = useMemo(() => weekDays.findIndex((d) => sameDay(d, today)), [weekDays, today]);
  const [selectedDayIdx, setSelectedDayIdx] = useState<number>(todayIdx >= 0 ? todayIdx : 0);

  // When the user navigates weeks, keep the selected weekday index — so
  // "Tuesday" stays selected when moving across weeks. If today appears in
  // the new week and the user hasn't manually picked a day yet, prefer today.
  const lastTodayIdxRef = useRef<number>(todayIdx);
  useEffect(() => {
    if (todayIdx !== -1 && todayIdx !== lastTodayIdxRef.current) {
      setSelectedDayIdx(todayIdx);
    }
    lastTodayIdxRef.current = todayIdx;
  }, [todayIdx]);

  const dayTimed = useMemo(() => {
    const list = timedByDay[selectedDayIdx] ?? [];
    return [...list].sort(
      (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime(),
    );
  }, [timedByDay, selectedDayIdx]);

  const dayAllDay = allDayByDay[selectedDayIdx] ?? [];
  const isEmpty = dayTimed.length === 0 && dayAllDay.length === 0;

  return (
    <div className="md:hidden flex-1 flex flex-col gap-4">
      {/* Date scroller */}
      <div className="-mx-2 overflow-x-auto pb-1" aria-label="Selettore giorno">
        <div className="flex items-center gap-2 px-2 w-max">
          {weekDays.map((d, i) => {
            const isActive = i === selectedDayIdx;
            const isToday = sameDay(d, today);
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSelectedDayIdx(i)}
                className={cn(
                  "shrink-0 min-w-[64px] px-3 py-2 rounded-full flex flex-col items-center gap-0.5 transition-colors",
                  isActive
                    ? "bg-primary-container text-on-primary-container shadow-soft-blue"
                    : "text-outline hover:bg-surface-container active:bg-surface-container-high",
                )}
                aria-pressed={isActive}
                aria-current={isToday ? "date" : undefined}
              >
                <span className="text-label-sm uppercase tracking-wider font-medium">
                  {DAY_LABELS[i]}
                </span>
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    !isActive && isToday && "text-aura-primary",
                  )}
                >
                  {d.getDate()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* All-day pinned section — only renders when the selected day has
          at least one all-day event. "Tutto il giorno" header replaces
          the per-card time label so the strip reads as a calendar
          banner rather than a clickable session card. */}
      {dayAllDay.length > 0 && (
        <section aria-label="Eventi giornalieri" className="flex flex-col gap-2">
          <p className="text-label-sm uppercase tracking-wider text-outline px-1">
            Tutto il giorno
          </p>
          <div className="flex flex-wrap gap-2">
            {dayAllDay.map((b) => (
              <AllDayPill key={b.id} booking={b} />
            ))}
          </div>
        </section>
      )}

      {/* Timed event list — Aura skeletons on first load to avoid the
          flash-of-empty-state while bookingsQ resolves. */}
      {isLoading ? (
        <ul className="flex flex-col gap-3" aria-label="Caricamento eventi">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <AuraCardSkeleton className="p-4 flex items-stretch gap-3 h-24">
                <div className="flex flex-col items-center justify-center gap-2 min-w-[56px]">
                  <AuraLineSkeleton className="w-10 h-4" />
                  <AuraLineSkeleton className="w-8 h-3" />
                </div>
                <div className="w-px self-stretch bg-outline-variant/30" aria-hidden />
                <div className="flex-1 flex flex-col justify-center gap-2">
                  <AuraLineSkeleton className="w-2/3 h-4" />
                  <AuraLineSkeleton className="w-1/3 h-3" />
                </div>
              </AuraCardSkeleton>
            </li>
          ))}
        </ul>
      ) : isEmpty ? (
        <div className="rounded-[24px] border border-outline-variant/30 bg-white p-6 text-center text-sm text-outline shadow-soft-blue">
          <CalendarIcon className="size-8 mx-auto mb-2 text-outline-variant" />
          Nessun evento programmato per questo giorno.
        </div>
      ) : dayTimed.length === 0 ? null : (
        <ul className="flex flex-col gap-3" aria-label="Eventi del giorno">
          {dayTimed.map((b) => (
            <li key={b.id}>
              <MobileEventCard
                booking={b}
                clientsMap={clientsMap}
                eventTypesMap={eventTypesMap}
                onSelectAssign={onSelectAssign}
                onSelectClient={onSelectClient}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface MobileEventCardProps {
  booking: BookingRow;
  clientsMap: Map<string, ProfileRow>;
  eventTypesMap: Map<string, EventTypeRow>;
  onSelectAssign: (b: BookingRow) => void;
  onSelectClient: (clientId: string) => void;
}

function MobileEventCard({
  booking: b,
  clientsMap,
  eventTypesMap,
  onSelectAssign,
  onSelectClient,
}: MobileEventCardProps) {
  const d = new Date(b.scheduled_at);
  const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
  // H3: prefer the per-booking snapshot so edits to event_types.duration
  // don't retroactively change historical sessions on the agenda.
  const duration = b.duration_min ?? et?.duration ?? 60;

  // Personal Block discriminator (checked first — a personal block can
  // never also be unassigned/external).
  const isPersonal = !!b.is_personal;
  const isUnassigned = !isPersonal && !b.client_id;
  const isExternal = !isPersonal && !!b.client_id && b.client_id === b.coach_id;
  // clientsMap.get returns undefined for missing/unknown ids; the optional
  // chain below already guards every access. Personal blocks skip the
  // lookup entirely since client_id is null.
  const client =
    !isPersonal && b.client_id && !isExternal ? clientsMap.get(b.client_id) : undefined;
  const typeLabel = et?.name ?? (b.session_type ? sessionLabel(b.session_type) : "Sessione");

  const startTime = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const endTime = new Date(d.getTime() + duration * 60_000).toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const isClickable = !isExternal && !isPersonal;
  const handleTap = () => {
    if (isUnassigned) {
      onSelectAssign(b);
    } else if (!isExternal && !isPersonal && b.client_id) {
      onSelectClient(b.client_id);
    }
  };

  const personalLabel = personalBlockTitle(b);

  const title = isPersonal
    ? personalLabel
    : isUnassigned
      ? "Da assegnare"
      : isExternal
        ? (b.notes ?? "").replace(IMPORT_PREFIX, "") || "Evento esterno"
        : (client?.full_name ?? "Cliente");
  const subtitle = isExternal || isPersonal ? null : typeLabel;

  return (
    <button
      type="button"
      onClick={isClickable ? handleTap : undefined}
      disabled={!isClickable}
      aria-label={`${title} alle ${startTime}`}
      className={cn(
        "w-full rounded-[24px] border border-outline-variant/30 shadow-soft-blue p-4 flex items-stretch gap-3 text-left",
        // Personal blocks: muted surface to read as "blocked time, not a
        // client session". Uses the Aura neutral container token so it
        // stays in step with the design system in light/dark variants.
        isPersonal ? "bg-surface-container-high" : "bg-white",
        isClickable && "hover:shadow-md active:scale-[0.99] transition-all cursor-pointer",
        !isClickable && "cursor-default",
      )}
    >
      <div className="flex flex-col justify-center items-center min-w-[56px] gap-0.5">
        <span
          className={cn(
            "text-base font-semibold tabular-nums",
            isPersonal ? "text-outline" : "text-aura-primary",
          )}
        >
          {startTime}
        </span>
        <span className="text-label-sm tabular-nums text-outline">{endTime}</span>
      </div>
      <div className="w-px bg-outline-variant/30 self-stretch" aria-hidden="true" />
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
        <h3 className="text-sm font-semibold line-clamp-2 text-on-surface">{title}</h3>
        {subtitle && <p className="text-xs text-outline truncate">{subtitle}</p>}
        <div className="flex flex-wrap gap-1.5 mt-1">
          {isPersonal && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-label-sm font-medium bg-surface-container text-outline">
              Personale
            </span>
          )}
          {isUnassigned && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-label-sm font-semibold bg-warning-container text-tertiary">
              Assegna
            </span>
          )}
          {isExternal && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-label-sm font-medium bg-surface-container text-outline">
              Esterno
            </span>
          )}
          {!isUnassigned && !isExternal && !isPersonal && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-label-sm font-medium bg-primary-fixed/60 text-on-primary-fixed-variant">
              {sessionLabel(b.session_type)}
            </span>
          )}
          {/* Native Google Meet link surfaced as a chip when sync-calendar
              has minted a Meet room for this booking. Click stops the
              card's outer onClick (which would open the focus panel)
              and opens the Meet URL in a new tab. */}
          {!isUnassigned && !isExternal && !isPersonal && b.meeting_link && (
            <a
              href={b.meeting_link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-sm font-semibold bg-secondary-container text-on-secondary-container"
            >
              <span aria-hidden>🎥</span>
              Meet
            </a>
          )}
        </div>
      </div>
    </button>
  );
}
