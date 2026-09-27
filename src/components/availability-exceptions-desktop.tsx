// ----------------------------------------------------------------------------
// «Eccezioni» della Disponibilità desktop (passata 08, D6)
// ----------------------------------------------------------------------------
// Un'eccezione per periodo nella pagina, una riga per giorno nel database
// (availability-exceptions.ts). L'elenco mostra i periodi che finiscono oggi
// o dopo, con le sessioni cliente già prenotate che il periodo incrocia e il
// link al Calendario sul giorno della prima. Aggiunta e rimozione passano da
// availability-actions.ts, con «Ripristina». La card del telefono resta
// availability-exceptions-card.tsx.
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, CalendarOff, Loader2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { dialogSecondaryButton } from "@/components/coach-dialog";
import { SegmentedControl } from "@/components/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { addException, removeExceptions, restoreExceptions } from "@/lib/availability-actions";
import {
  BOOKINGS_UNREADABLE,
  bookedInPeriod,
  clashText,
  exceptionFormError,
  formClashText,
  groupDetail,
  groupExceptions,
  localIsoDate,
  newExceptionInput,
  periodLabel,
  removeExceptionLabel,
  upcomingGroups,
  withFrom,
  type ExceptionGroup,
  type ExceptionInput,
} from "@/lib/availability-exceptions";
import { supabaseAvailabilityStore } from "@/lib/availability-store";
import { timeOptionsWith } from "@/lib/availability-week";
import {
  useCoachAvailabilityExceptions,
  useCoachBookings,
  type AvailabilityExceptionRow,
} from "@/lib/queries";
import { toastWithUndo } from "@/lib/toast";
import { errorMessage } from "@/lib/utils";

const FIELD =
  "h-[38px] rounded-xl bg-surface-container-low px-2.5 text-sm text-on-surface outline-none";
const TIME =
  "h-[38px] rounded-full bg-surface-container-low px-3 text-sm font-semibold tabular-nums text-on-surface outline-none";

const MODES = [
  { value: "all", label: "Tutto il giorno" },
  { value: "range", label: "Fascia oraria" },
] as const;

function groupKey(g: ExceptionGroup): string {
  return g.rows.map((r) => r.id).join(",");
}

export function AvailabilityExceptionsDesktop({
  coachId,
  now,
}: {
  coachId: string | undefined;
  now: Date;
}) {
  const qc = useQueryClient();
  const exQ = useCoachAvailabilityExceptions(coachId);
  const bookingsQ = useCoachBookings(coachId);
  const today = localIsoDate(now);
  const year = now.getFullYear();
  const [input, setInput] = useState<ExceptionInput>(() => newExceptionInput(today));
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const groups = useMemo(
    () => (exQ.data ? upcomingGroups(groupExceptions(exQ.data), today) : []),
    [exQ.data, today],
  );
  const bookings = bookingsQ.data;
  const bookingsFailed = bookingsQ.isError && !bookings;

  const formError = exceptionFormError(input, today);
  let formClash: string | null = null;
  if (!formError && bookingsFailed) formClash = BOOKINGS_UNREADABLE;
  else if (!formError && bookings) {
    const n = bookedInPeriod(
      bookings,
      {
        from: input.from,
        to: input.to,
        allDay: input.allDay,
        start: input.start,
        end: input.end,
      },
      now,
    ).length;
    if (n > 0) formClash = formClashText(n);
  }

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["availability_exceptions", coachId] });
  }

  async function undoAdd(rows: AvailabilityExceptionRow[]) {
    if (!coachId) return;
    try {
      await removeExceptions(supabaseAvailabilityStore, coachId, rows);
    } catch (e) {
      toast.error("Eccezione non tolta", { description: errorMessage(e) });
    } finally {
      refresh();
    }
  }

  async function add() {
    if (!coachId || formError || adding) return;
    setAdding(true);
    try {
      const rows = await addException(supabaseAvailabilityStore, coachId, input);
      setInput(newExceptionInput(today));
      toastWithUndo("Eccezione aggiunta.", () => void undoAdd(rows));
    } catch (e) {
      toast.error("Eccezione non aggiunta", { description: errorMessage(e) });
    } finally {
      setAdding(false);
      refresh();
    }
  }

  async function restore(rows: AvailabilityExceptionRow[]) {
    try {
      await restoreExceptions(supabaseAvailabilityStore, rows);
    } catch (e) {
      toast.error("Eccezione non ripristinata", { description: errorMessage(e) });
    } finally {
      refresh();
    }
  }

  async function remove(g: ExceptionGroup) {
    if (!coachId || removing) return;
    setRemoving(groupKey(g));
    try {
      const rows = await removeExceptions(supabaseAvailabilityStore, coachId, g.rows);
      toastWithUndo("Eccezione rimossa.", () => void restore(rows));
    } catch (e) {
      toast.error("Eccezione non rimossa", { description: errorMessage(e) });
    } finally {
      setRemoving(null);
      refresh();
    }
  }

  function clashLine(g: ExceptionGroup) {
    if (bookingsFailed) {
      return <span className="text-xs font-semibold text-warning-text">{BOOKINGS_UNREADABLE}</span>;
    }
    if (!bookings) return null;
    const hit = bookedInPeriod(bookings, g, now);
    const first = hit[0];
    if (!first) return null;
    return (
      <Link
        to="/trainer/calendar"
        search={{ date: localIsoDate(new Date(first.scheduled_at)) }}
        className="self-start text-left text-xs font-semibold text-warning-text hover:underline"
      >
        {clashText(hit.length)}
      </Link>
    );
  }

  return (
    <section
      aria-labelledby="exceptions-title"
      className="flex flex-col gap-3.5 rounded-[28px] bg-white p-6 shadow-[0px_4px_20px_rgba(0,86,133,0.05)]"
    >
      <div className="flex flex-col gap-1">
        <h2 id="exceptions-title" className="text-xl font-semibold">
          Eccezioni
        </h2>
        <p className="text-[13px] text-on-surface-variant">
          Ferie, corsi, chiusure: in questi periodi i clienti non possono prenotare.
        </p>
      </div>

      {exQ.isError && !exQ.data ? (
        <div className="flex flex-col items-start gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="size-4 text-danger-text" aria-hidden />
            Non riesco a leggere le eccezioni.
          </p>
          <button
            type="button"
            onClick={() => void exQ.refetch()}
            className={dialogSecondaryButton}
          >
            Riprova
          </button>
        </div>
      ) : !exQ.data ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          <Skeleton className="h-14 w-full rounded-2xl" />
          <Skeleton className="h-14 w-full rounded-2xl" />
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-outline">Nessuna eccezione in programma.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {groups.map((g) => {
            const label = periodLabel(g.from, g.to, year);
            const key = groupKey(g);
            return (
              <li key={key} className="flex items-start gap-3 rounded-2xl bg-surface px-3.5 py-3">
                <CalendarOff
                  className="mt-0.5 size-4 shrink-0 text-on-surface-variant"
                  aria-hidden
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-xs text-outline">{groupDetail(g)}</span>
                  {clashLine(g)}
                </div>
                <button
                  type="button"
                  onClick={() => void remove(g)}
                  disabled={removing !== null}
                  aria-label={removeExceptionLabel(label)}
                  className="grid size-8 shrink-0 place-items-center rounded-full text-outline transition-colors hover:bg-danger-soft hover:text-danger-text disabled:opacity-60"
                >
                  {removing === key ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="size-3.5" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2.5 rounded-[18px] border border-dashed border-outline-variant p-3.5">
        <p className="text-[13px] font-bold">Nuova eccezione</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-on-surface-variant">Dal</span>
            <input
              type="date"
              value={input.from}
              min={today}
              onChange={(e) => setInput((x) => withFrom(x, e.target.value))}
              className={FIELD}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-on-surface-variant">Al</span>
            <input
              type="date"
              value={input.to}
              min={input.from || today}
              onChange={(e) => setInput((x) => ({ ...x, to: e.target.value }))}
              className={FIELD}
            />
          </label>
        </div>
        <SegmentedControl
          value={input.allDay ? "all" : "range"}
          options={MODES}
          onChange={(v) => setInput((x) => ({ ...x, allDay: v === "all" }))}
          ariaLabel="Durata dell'eccezione"
          className="self-start"
        />
        {!input.allDay && (
          <div className="flex items-center gap-2">
            <select
              value={input.start}
              aria-label="Dalle ore"
              onChange={(e) => setInput((x) => ({ ...x, start: e.target.value }))}
              className={TIME}
            >
              {timeOptionsWith(input.start).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <span className="text-outline" aria-hidden>
              –
            </span>
            <select
              value={input.end}
              aria-label="Alle ore"
              onChange={(e) => setInput((x) => ({ ...x, end: e.target.value }))}
              className={TIME}
            >
              {timeOptionsWith(input.end).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
        <input
          value={input.reason}
          onChange={(e) => setInput((x) => ({ ...x, reason: e.target.value }))}
          placeholder="Motivo, es. Ferie"
          aria-label="Motivo"
          className={FIELD}
        />
        {formError && (
          <p role="alert" className="text-xs font-semibold text-danger-text">
            {formError}
          </p>
        )}
        {formClash && <p className="text-xs font-semibold text-warning-text">{formClash}</p>}
        <button
          type="button"
          onClick={() => void add()}
          disabled={!!formError || adding || !coachId}
          className="flex h-[38px] items-center justify-center gap-2 rounded-full bg-aura-primary text-sm font-semibold text-white disabled:bg-outline-variant"
        >
          {adding && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Aggiungi eccezione
        </button>
      </div>
    </section>
  );
}
