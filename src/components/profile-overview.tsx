// ----------------------------------------------------------------------------
// Tab «Panoramica» del Profilo desktop (passata 06)
// ----------------------------------------------------------------------------
// Sinistra: «Pacchetto e percorso» (fine del blocco in corso, segmenti per
// blocco, crediti rimasti del blocco, rinnovo in pagina quando è in scadenza:
// P5), «Prossime sessioni» (3, clic → Calendario sull'evento), «Ultime
// sessioni» (5, clic → modifica; «Vedi tutte» → tab Sessioni, K3).
// Destra: «Note e obiettivi», «Presenza», «Andamento BIA».
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { card } from "@/components/profile-styles";
import { StatusChip } from "@/components/profile-ui";
import { ProfileNotesCard } from "@/components/profile-notes-card";
import { TrainerBiaPanel } from "@/components/trainer-bia-panel";
import type { PresenceSummary } from "@/lib/attendance";
import { localDate, localTime } from "@/lib/calendar-time";
import {
  daysAgo,
  longDay,
  recentSessions,
  upcomingSessions,
  type PackageSummary,
  typeInfo,
} from "@/lib/client-profile";
import { formatCreditsOfTail } from "@/lib/credits";
import { validExtras } from "@/lib/extra-credits";
import type { ProfileBooking, ProfileExtra } from "@/lib/profile-load";
import type { EventTypeRow } from "@/lib/queries";
import type { RenewalInfo } from "@/lib/renewal";
import { cn } from "@/lib/utils";

interface CreditBar {
  key: string;
  name: string;
  color: string;
  left: number;
  total: number;
}

function Bars({ rows }: { rows: CreditBar[] }) {
  if (rows.length === 0) {
    return <p className="m-0 text-sm text-on-surface-variant">Nessun credito assegnato.</p>;
  }
  return (
    <>
      {rows.map((k) => (
        <div key={k.key} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 font-semibold text-on-surface">
              <span
                aria-hidden
                className="size-2.5 rounded-[3px]"
                style={{ background: k.color }}
              />
              {k.name}
            </span>
            <span className="tabular-nums text-on-surface-variant">
              <strong className="text-on-surface">{k.left}</strong>{" "}
              {formatCreditsOfTail(k.left, k.total)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-container">
            <div
              className="h-full rounded-full"
              style={{
                width: `${k.total ? Math.round((k.left / k.total) * 100) : 0}%`,
                background: k.color,
              }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

/**
 * Le barre dei crediti extra, per tipologia, coi soli extra che valgono adesso
 * (passata 11 del lato cliente: prima contavano anche i Booster scaduti). Per
 * un cliente con percorso stanno sotto quelle del blocco, col nome «· extra»:
 * prima comparivano solo per i clienti liberi, e un extra dato dal Pacchetto
 * a chi ha un percorso non si vedeva.
 */
function extraBars(
  extras: readonly ProfileExtra[],
  eventTypes: readonly EventTypeRow[],
  now: Date,
  suffix = "",
) {
  const by = new Map<string, CreditBar>();
  for (const e of validExtras(extras, now)) {
    const key = `extra:${e.event_type_id ?? "—"}`;
    const t = typeInfo(eventTypes, e.event_type_id, "PT Session");
    const row = by.get(key) ?? {
      key,
      name: `${t.name}${suffix}`,
      color: t.color,
      left: 0,
      total: 0,
    };
    row.total += e.quantity;
    row.left += Math.max(0, e.quantity - e.quantity_booked);
    by.set(key, row);
  }
  return [...by.values()].filter((r) => r.total > 0);
}

export interface ProfileOverviewProps {
  clientId: string;
  coachId: string;
  pathType: string | null;
  bookings: readonly ProfileBooking[];
  extras: readonly ProfileExtra[];
  eventTypes: readonly EventTypeRow[];
  summary: PackageSummary;
  renewal: RenewalInfo | null;
  presence: PresenceSummary;
  now: Date;
  onGoPath: () => void;
  onGoSessions: () => void;
  onRenew: () => void;
  onEdit: (b: ProfileBooking) => void;
}

export function ProfileOverview({
  clientId,
  coachId,
  pathType,
  bookings,
  extras,
  eventTypes,
  summary,
  renewal,
  presence,
  now,
  onGoPath,
  onGoSessions,
  onRenew,
  onEdit,
}: ProfileOverviewProps) {
  const free = pathType === "free";
  const bars: CreditBar[] = free
    ? extraBars(extras, eventTypes, now)
    : [
        ...summary.credits
          .filter((c) => c.assigned > 0)
          .map((c) => ({
            key: c.key,
            left: c.left,
            total: c.assigned,
            ...typeInfo(eventTypes, c.eventTypeId, c.sessionType),
          })),
        ...extraBars(extras, eventTypes, now, " · extra"),
      ];
  const upcoming = upcomingSessions(bookings, now, 3);
  const recent = recentSessions(bookings, now, 5);
  const att = presence.percent;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-5">
      <div className="flex min-w-0 flex-col gap-5">
        <section className={cn(card, "flex flex-col gap-[18px]")}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="card-title m-0 text-on-surface">Pacchetto e percorso</h2>
            <span className="text-[13px] text-outline">{summary.expiryLabel}</span>
          </div>
          {summary.blockLabel && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-[13px]">
                <span className="font-semibold text-on-surface-variant">{summary.blockLabel}</span>
                <button
                  type="button"
                  onClick={onGoPath}
                  className="font-semibold text-aura-primary"
                >
                  Vedi il percorso
                </button>
              </div>
              {summary.segments.length > 0 && (
                <div className="flex gap-1.5" aria-hidden>
                  {summary.segments.map((s, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-2.5 flex-1 rounded-full",
                        s === "past"
                          ? "bg-aura-primary"
                          : s === "current"
                            ? "bg-[#5b8db8]"
                            : "bg-surface-variant",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-col gap-3.5">
            <p className="m-0 text-xs font-bold uppercase tracking-[0.05em] text-outline">
              {free ? "Crediti extra" : summary.creditsTitle}
            </p>
            <Bars rows={bars} />
          </div>
          {renewal && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-warning-line bg-warning-soft px-3.5 py-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-warning-text">
                <TriangleAlert className="size-4" aria-hidden />
                {renewal.reason}.
              </span>
              <button
                type="button"
                onClick={onRenew}
                className="h-[34px] rounded-full bg-aura-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-container"
              >
                Rinnova
              </button>
            </div>
          )}
        </section>

        <section className={cn(card, "flex flex-col gap-3")}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="card-title m-0 text-on-surface">Prossime sessioni</h2>
            <Link
              to="/trainer/calendar"
              search={{ new: "sessione", client: clientId }}
              className="text-[13px] font-semibold text-aura-primary"
            >
              Nuova sessione
            </Link>
          </div>
          {upcoming.length === 0 && (
            <p className="m-0 text-sm text-on-surface-variant">Nessuna sessione in agenda.</p>
          )}
          {upcoming.map((b) => {
            const t = typeInfo(eventTypes, b.event_type_id, b.session_type);
            const at = new Date(b.scheduled_at);
            return (
              <Link
                key={b.id}
                to="/trainer/calendar"
                search={{ date: localDate(at), event: b.id }}
                className="flex items-center gap-3 border-t border-surface-container-low py-2.5 text-left hover:text-aura-primary"
              >
                <span
                  aria-hidden
                  className="h-9 w-1 shrink-0 rounded-full"
                  style={{ background: t.color }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">
                    {longDay(b.scheduled_at)} · {localTime(at)}
                  </span>
                  <span className="text-xs text-outline">{t.name}</span>
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    b.client_confirmed_at ? "text-success-text" : "text-warning-text",
                  )}
                >
                  {b.client_confirmed_at ? "Confermata" : "Da confermare"}
                </span>
                <ChevronRight className="size-4 text-outline" aria-hidden />
              </Link>
            );
          })}
        </section>

        <section className={cn(card, "flex flex-col gap-3")}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="card-title m-0 text-on-surface">Ultime sessioni</h2>
            <button
              type="button"
              onClick={onGoSessions}
              className="text-[13px] font-semibold text-aura-primary"
            >
              Vedi tutte ({bookings.length})
            </button>
          </div>
          {recent.length === 0 && (
            <p className="m-0 text-sm text-on-surface-variant">Nessuna sessione registrata.</p>
          )}
          {recent.map((b) => {
            const t = typeInfo(eventTypes, b.event_type_id, b.session_type);
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => onEdit(b)}
                className="flex items-center gap-3 border-t border-surface-container-low py-2.5 text-left"
              >
                <span
                  aria-hidden
                  className="h-9 w-1 shrink-0 rounded-full"
                  style={{ background: t.color }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold">{t.name}</span>
                  <span className="text-xs text-outline">
                    {longDay(b.scheduled_at)} · {localTime(new Date(b.scheduled_at))}
                  </span>
                </span>
                <StatusChip status={b.status} />
              </button>
            );
          })}
          <p className="m-0 text-xs text-outline">Clic su una sessione per modificarla.</p>
        </section>
      </div>

      <div className="flex min-w-0 flex-col gap-5">
        <ProfileNotesCard coachId={coachId} clientId={clientId} />

        <section className={cn(card, "flex flex-col gap-4")}>
          <h2 className="card-title m-0 text-on-surface">Presenza</h2>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="flex flex-col gap-0.5">
              <span
                className={cn(
                  "font-display text-[26px] font-bold tabular-nums",
                  att === null
                    ? "text-outline"
                    : att >= 80
                      ? "text-success-text"
                      : att >= 60
                        ? "text-warning-text"
                        : "text-danger-text",
                )}
              >
                {att === null ? "—" : `${att}%`}
              </span>
              <span className="text-xs text-outline">Presenza</span>
            </div>
            <div className="flex flex-col gap-0.5 border-x border-surface-container">
              <span
                className={cn(
                  "font-display text-[26px] font-bold tabular-nums",
                  presence.absences > 0 ? "text-danger-text" : "text-on-surface",
                )}
              >
                {presence.absences}
              </span>
              <span className="text-xs text-outline">Assenze (8 sett.)</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-[26px] font-bold tabular-nums text-on-surface">
                {presence.perWeek}
              </span>
              <span className="text-xs text-outline">Sessioni a settimana</span>
            </div>
          </div>
          <p className="m-0 text-center text-[13px] text-on-surface-variant">
            Ultima sessione svolta:{" "}
            {presence.lastCompleted
              ? `${longDay(presence.lastCompleted)} (${daysAgo(presence.lastCompleted, now)})`
              : "nessuna"}
          </p>
        </section>

        <TrainerBiaPanel clientId={clientId} coachId={coachId} desktop />
      </div>
    </div>
  );
}
