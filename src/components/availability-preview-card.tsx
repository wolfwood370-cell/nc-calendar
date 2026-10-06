// ----------------------------------------------------------------------------
// «Anteprima della settimana» e «Regole di prenotazione» della Disponibilità
// desktop (passata 08, D1 e D2)
// ----------------------------------------------------------------------------
// L'anteprima conta le ore della bozza e le sessioni della tipologia
// principale con la sua durata e il suo margine. Le regole sono quelle che
// Prenota applica davvero (booking-rules.ts), in sola lettura.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ESTIMATE_UNREADABLE,
  estimateText,
  formatHours,
  hoursPerDay,
  previewType,
  sessionsFit,
  weekHours,
  type WeekDraft,
} from "@/lib/availability-week";
import {
  CLIENT_BOOKING_HORIZON_DAYS,
  CLIENT_MIN_NOTICE_HOURS,
  bookingRulesNote,
  horizonLabel,
  noticeLabel,
} from "@/lib/booking-rules";
import type { EventTypeRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

export function AvailabilityPreviewCard({
  week,
  weekFailed,
  types,
  typesFailed,
}: {
  /** null finché l'orario non è letto. */
  week: WeekDraft | null;
  weekFailed: boolean;
  /** undefined finché le tipologie non sono lette. */
  types: EventTypeRow[] | undefined;
  typesFailed: boolean;
}) {
  const perDay = week ? hoursPerDay(week) : [];
  const maxH = Math.max(1, ...perDay.map((d) => d.hours));
  const type = types ? previewType(types) : null;
  let estimate: string | null = null;
  if (week && typesFailed) estimate = ESTIMATE_UNREADABLE;
  else if (week && type) estimate = estimateText(sessionsFit(week, type), type);

  return (
    <section
      aria-labelledby="preview-title"
      className="flex flex-col gap-2.5 rounded-[28px] bg-aura-primary p-6 text-white"
    >
      <h2 id="preview-title" className="text-[15px] font-semibold text-[#cfe6ff]">
        Anteprima della settimana
      </h2>
      {week ? (
        <>
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[44px] font-extrabold leading-none tabular-nums">
              {formatHours(weekHours(week))}
            </span>
            <span className="text-sm text-on-primary-container">ore prenotabili</span>
          </div>
          {estimate && <p className="text-[13px] leading-normal text-white/85">{estimate}</p>}
          {!estimate && types === undefined && !typesFailed && (
            <Skeleton className="h-4 w-4/5 rounded bg-white/15" />
          )}
          <div className="mt-1.5 flex h-16 items-end gap-2" aria-hidden>
            {perDay.map((d) => (
              <div key={d.dow} className="flex h-full flex-1 flex-col justify-end">
                <div
                  className={cn(
                    "w-full rounded-t-[6px]",
                    d.hours > 0 ? "bg-on-primary-container" : "bg-white/15",
                  )}
                  style={{ height: `${Math.max(6, (d.hours / maxH) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 text-[11px] text-white/75" aria-hidden>
            {perDay.map((d) => (
              <span key={d.dow} className="flex-1 text-center">
                {d.short}
              </span>
            ))}
          </div>
        </>
      ) : weekFailed ? (
        <p className="text-[13px] leading-normal text-white/85">
          Anteprima non disponibile: non riesco a leggere l'orario settimanale.
        </p>
      ) : (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-11 w-32 rounded-xl bg-white/15" />
          <Skeleton className="h-16 w-full rounded-xl bg-white/15" />
        </div>
      )}
    </section>
  );
}

const RULE_ROW =
  "flex items-center justify-between gap-3 rounded-2xl bg-surface px-3.5 py-3 text-sm";

export function BookingRulesCard() {
  return (
    <section
      aria-labelledby="rules-title"
      className="flex flex-col gap-3 rounded-[28px] bg-white p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]"
    >
      <h2 id="rules-title" className="card-title">
        Regole di prenotazione
      </h2>
      <div className="flex flex-col gap-2.5">
        <div className={RULE_ROW}>
          <span className="text-on-surface-variant">Preavviso minimo</span>
          <strong>{noticeLabel(CLIENT_MIN_NOTICE_HOURS)}</strong>
        </div>
        <div className={RULE_ROW}>
          <span className="text-on-surface-variant">Prenotabile fino a</span>
          <strong>{horizonLabel(CLIENT_BOOKING_HORIZON_DAYS)}</strong>
        </div>
        <div className={RULE_ROW}>
          <span className="text-on-surface-variant">Margine tra le sessioni</span>
          <Link to="/trainer/event-types" className="font-semibold text-aura-primary">
            Per tipologia
          </Link>
        </div>
      </div>
      {/* on-surface-variant e non outline: outline sul bianco fa 4,47:1, sotto
          il 4,5:1 del testo piccolo (contrast.test.ts, passata 10). */}
      <p className="text-xs leading-normal text-on-surface-variant">{bookingRulesNote()}</p>
    </section>
  );
}
