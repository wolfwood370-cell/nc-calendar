// ----------------------------------------------------------------------------
// Tab «Percorso» del Profilo desktop (passata 06, K1 e K5)
// ----------------------------------------------------------------------------
// Riepilogo (inizio percorso, struttura, rinnovo automatico per i mensili;
// per i fissi ancora accesi l'avviso con «Spegni»), «Ripristina le date
// standard» se ci sono settimane spostate, blocchi espandibili con le quattro
// settimane: la data si cambia sul posto e la settimana resta «da salvare»
// finché il coach non usa la barra in basso (nel componente principale).
// ----------------------------------------------------------------------------

import { addDays, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { ChevronDown, ChevronRight, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { BlockCreditsDialog } from "@/components/block-credits-dialog";
import {
  CoachAlertDialog,
  CoachAlertDialogCancel,
  CoachAlertDialogContent,
  CoachAlertDialogDescription,
  CoachAlertDialogTitle,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { card } from "@/components/profile-styles";
import { StatusChip } from "@/components/profile-ui";
import { localTime } from "@/lib/calendar-time";
import {
  autoRenewHint,
  changedWeeks,
  hasShiftedWeeks,
  longDay,
  WEEKS_PER_BLOCK,
  type RenewalControl,
  type WeekRow,
  typeInfo,
} from "@/lib/client-profile";
import type { ProfileAllocation, ProfileBlock, ProfileBooking } from "@/lib/profile-load";
import type { EventTypeRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

const day = (d: Date) => format(d, "d MMM", { locale: it });

export interface ProfilePathProps {
  clientName: string;
  pathType: string | null;
  blocks: readonly ProfileBlock[];
  allocations: readonly ProfileAllocation[];
  bookings: readonly ProfileBooking[];
  eventTypes: readonly EventTypeRow[];
  rows: readonly WeekRow[];
  savedRows: readonly WeekRow[];
  pathStart: string | null;
  renewal: RenewalControl;
  renewalSaving: boolean;
  now: Date;
  onMoveWeek: (idx: number, date: Date) => void;
  onStartChange: (date: Date) => void;
  onStandardDates: () => void;
  onRenewalChange: (on: boolean) => void;
  onEdit: (b: ProfileBooking) => void;
  onAssignPath: () => void;
  onCreditsSaved: () => void;
}

export function ProfilePath(props: ProfilePathProps) {
  const {
    clientName,
    pathType,
    blocks,
    allocations,
    bookings,
    eventTypes,
    rows,
    savedRows,
    pathStart,
    renewal,
    renewalSaving,
    now,
    onMoveWeek,
    onStartChange,
    onStandardDates,
    onRenewalChange,
    onEdit,
    onAssignPath,
    onCreditsSaved,
  } = props;
  const [openBlock, setOpenBlock] = useState<string | null | undefined>(undefined);
  const [confirmStd, setConfirmStd] = useState(false);
  const [editStart, setEditStart] = useState(false);

  if (blocks.length === 0) {
    return (
      <div className={cn(card, "flex flex-col items-start gap-3 p-8")}>
        <h2 className="card-title m-0 text-on-surface">Nessun percorso a blocchi</h2>
        <p className="m-0 max-w-[560px] text-sm leading-normal text-on-surface-variant">
          {pathType === "free"
            ? `${clientName} è un cliente libero: prenota con i crediti extra. Puoi assegnare un percorso fisso o un abbonamento mensile.`
            : `${clientName} non ha ancora un percorso. Puoi assegnare un percorso fisso o un abbonamento mensile.`}
        </p>
        <button type="button" onClick={onAssignPath} className={dialogPrimaryButton}>
          Assegna un percorso
        </button>
      </div>
    );
  }

  const sorted = [...blocks].sort((a, b) => a.sequence_order - b.sequence_order);
  const changed = new Set(changedWeeks(rows, savedRows));
  const nowMs = now.getTime();
  const lastEnd = sorted[sorted.length - 1]?.end_date ?? null;

  // Intervallo di ogni blocco dalle sue settimane (come la pagina di prima), altrimenti dalle date del blocco.
  const view = sorted.map((b) => {
    const weeks = rows
      .map((row, idx) => ({ row, idx }))
      .filter(({ row }) => row.block_number === b.sequence_order);
    const firstMon = weeks[0]?.row.monday_date;
    const lastMon = weeks[weeks.length - 1]?.row.monday_date;
    const start = firstMon ? parseISO(firstMon) : parseISO(b.start_date);
    const end = lastMon ? addDays(parseISO(lastMon), 7) : addDays(parseISO(b.end_date), 1);
    const inBlock = bookings.filter((k) => {
      const t = new Date(k.scheduled_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    });
    return {
      b,
      weeks,
      start,
      end,
      current: nowMs >= start.getTime() && nowMs < end.getTime(),
      done: inBlock.filter((k) => k.status === "completed").length,
      total: inBlock.length,
    };
  });
  const defaultOpen = (view.find((v) => v.current) ?? view[0])?.b.id ?? null;
  const open = openBlock === undefined ? defaultOpen : openBlock;
  const recurring = pathType === "recurring";

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-center justify-between gap-3.5 rounded-[24px] bg-surface-container-lowest px-[22px] py-[18px] shadow-soft-blue">
        <div className="flex flex-wrap items-start gap-7">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-outline">Inizio percorso</span>
            <span className="flex items-center gap-2">
              <strong className="text-[15px] text-on-surface">
                {pathStart ? `${longDay(`${pathStart}T12:00:00`)} ${pathStart.slice(0, 4)}` : "—"}
              </strong>
              {editStart ? (
                <input
                  type="date"
                  autoFocus
                  aria-label="Nuova data d'inizio del percorso"
                  defaultValue={pathStart ?? ""}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    onStartChange(parseISO(e.target.value));
                    setEditStart(false);
                  }}
                  onBlur={() => setEditStart(false)}
                  className="h-8 rounded-full bg-surface-container px-3 text-xs font-semibold text-aura-primary"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditStart(true)}
                  className="text-xs font-semibold text-aura-primary"
                >
                  Cambia
                </button>
              )}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-outline">Struttura</span>
            <strong className="text-[15px] text-on-surface">
              {recurring
                ? `Blocchi da ${WEEKS_PER_BLOCK} settimane, ricorrenti`
                : `${sorted.length} ${sorted.length === 1 ? "blocco" : "blocchi"} da ${WEEKS_PER_BLOCK} settimane`}
            </strong>
          </div>
          {renewal?.kind === "toggle" && (
            <button
              type="button"
              role="switch"
              aria-checked={renewal.on}
              disabled={renewalSaving}
              onClick={() => onRenewalChange(!renewal.on)}
              className="flex items-center gap-2.5 text-left disabled:opacity-60"
            >
              <span
                className={cn(
                  "flex h-6 w-10 rounded-full p-[3px] transition-colors",
                  renewal.on ? "justify-end bg-aura-primary" : "justify-start bg-outline-variant",
                )}
              >
                <span className="size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
              </span>
              <span className="flex flex-col">
                <strong className="text-sm text-on-surface">Rinnovo automatico</strong>
                <span className="text-xs text-outline">{autoRenewHint(renewal.on, lastEnd)}</span>
              </span>
            </button>
          )}
        </div>
        {hasShiftedWeeks(rows) && (
          <button
            type="button"
            onClick={() => setConfirmStd(true)}
            className="flex h-9 items-center gap-1.5 rounded-full border border-surface-variant px-3.5 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container-low"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Ripristina le date standard
          </button>
        )}
      </section>

      {renewal?.kind === "fixed-on" && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-warning-line bg-warning-soft px-4 py-3"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-warning-text">
            <TriangleAlert className="size-4 shrink-0" aria-hidden />
            Il rinnovo automatico è ancora acceso: a fine percorso verrebbe creato un blocco nuovo.
          </span>
          <button
            type="button"
            disabled={renewalSaving}
            onClick={() => onRenewalChange(false)}
            className="h-[34px] rounded-full bg-aura-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-container disabled:opacity-60"
          >
            Spegni
          </button>
        </div>
      )}

      <p className="m-0 text-[13px] text-on-surface-variant">
        Cambia la data di una settimana per spostarla; le modifiche si salvano dalla barra in basso.
      </p>

      <div className="flex flex-col gap-3">
        {view.map(({ b, weeks, start, end, current, done, total }) => {
          const isOpen = open === b.id;
          const blockAllocs = allocations.filter((a) => a.block_id === b.id);
          return (
            <section
              key={b.id}
              className={cn(
                "overflow-hidden rounded-[24px] border-[1.5px] bg-surface-container-lowest shadow-soft-blue",
                current ? "border-aura-primary" : "border-transparent",
              )}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenBlock(isOpen ? null : b.id)}
                className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-surface"
              >
                {isOpen ? (
                  <ChevronDown className="size-4 text-outline" aria-hidden />
                ) : (
                  <ChevronRight className="size-4 text-outline" aria-hidden />
                )}
                <strong className="text-[15px] text-on-surface">Blocco {b.sequence_order}</strong>
                {current && (
                  <span className="rounded-full bg-aura-primary/10 px-2 py-0.5 text-[11px] font-bold text-aura-primary">
                    In corso
                  </span>
                )}
                <span className="text-[13px] text-outline">
                  {day(start)} – {day(addDays(end, -1))}
                </span>
                <span className="ml-auto text-[13px] font-semibold tabular-nums text-on-surface-variant">
                  {done} {done === 1 ? "svolta" : "svolte"} · {total} in totale
                </span>
              </button>
              {isOpen && (
                <div className="flex flex-col gap-3 px-5 pb-5">
                  <div className="flex justify-end">
                    <BlockCreditsDialog
                      blockId={b.id}
                      sequenceOrder={b.sequence_order}
                      allocations={blockAllocs}
                      eventTypes={eventTypes.map((e) => ({
                        id: e.id,
                        name: e.name,
                        base_type: e.base_type,
                      }))}
                      onSaved={onCreditsSaved}
                    />
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                    {weeks.map(({ row, idx }, w) => {
                      const mon = row.monday_date ? parseISO(row.monday_date) : null;
                      const wEnd = mon ? addDays(mon, 7) : null;
                      const isCur =
                        !!mon && !!wEnd && nowMs >= mon.getTime() && nowMs < wEnd.getTime();
                      const items =
                        mon && wEnd
                          ? bookings
                              .filter((k) => {
                                const t = new Date(k.scheduled_at).getTime();
                                return t >= mon.getTime() && t < wEnd.getTime();
                              })
                              .sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
                          : [];
                      return (
                        <div
                          key={row.week_number}
                          className={cn(
                            "flex flex-col gap-2",
                            wEnd && wEnd.getTime() < nowMs && "opacity-75",
                          )}
                        >
                          <label
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-full border-2 bg-surface-container py-1.5 pl-3 pr-1.5",
                              isCur
                                ? "border-aura-primary"
                                : row.shifted
                                  ? "border-[#f59e0b]"
                                  : "border-transparent",
                            )}
                          >
                            <span className="whitespace-nowrap text-xs font-bold text-on-surface">
                              Sett. {w + 1}
                            </span>
                            <input
                              type="date"
                              value={row.monday_date}
                              aria-label={`Data della settimana ${w + 1} del blocco ${b.sequence_order}`}
                              onChange={(e) => {
                                if (e.target.value) onMoveWeek(idx, parseISO(e.target.value));
                              }}
                              className="w-[118px] bg-transparent text-xs font-semibold text-aura-primary"
                            />
                          </label>
                          {changed.has(row.week_number) && (
                            <span className="pl-3 text-[11px] font-bold text-warning-text">
                              Spostata · da salvare
                            </span>
                          )}
                          {items.map((k) => {
                            const t = typeInfo(eventTypes, k.event_type_id, k.session_type);
                            const at = new Date(k.scheduled_at);
                            return (
                              <button
                                key={k.id}
                                type="button"
                                onClick={() => onEdit(k)}
                                className="flex items-center gap-2 rounded-[14px] border border-surface-container px-2.5 py-2 text-left hover:border-outline-variant"
                              >
                                <span
                                  aria-hidden
                                  className="h-7 w-1 shrink-0 rounded-full"
                                  style={{ background: t.color }}
                                />
                                <span className="flex min-w-0 flex-1 flex-col">
                                  <span className="text-[13px] font-semibold">
                                    {format(at, "EEE d MMM", { locale: it })} · {localTime(at)}
                                  </span>
                                  <span className="truncate text-[11px] text-outline">
                                    {t.name}
                                  </span>
                                </span>
                                <StatusChip status={k.status} small />
                              </button>
                            );
                          })}
                          {items.length === 0 && (
                            <p className="m-0 rounded-[14px] border border-dashed border-surface-variant px-3 py-2.5 text-xs text-outline">
                              Nessuna sessione
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <CoachAlertDialog open={confirmStd} onOpenChange={setConfirmStd}>
        <CoachAlertDialogContent>
          <CoachAlertDialogTitle>Ripristinare le date standard?</CoachAlertDialogTitle>
          <CoachAlertDialogDescription className="text-sm leading-normal text-on-surface-variant">
            Tutte le settimane spostate tornano alla sequenza calcolata dalla data d'inizio. La
            modifica si salva dalla barra in basso, e fino ad allora puoi annullarla.
          </CoachAlertDialogDescription>
          <div className="flex justify-end gap-2">
            <CoachAlertDialogCancel className={dialogSecondaryButton}>
              Indietro
            </CoachAlertDialogCancel>
            <button
              type="button"
              className={dialogPrimaryButton}
              onClick={() => {
                onStandardDates();
                setConfirmStd(false);
              }}
            >
              Ripristina
            </button>
          </div>
        </CoachAlertDialogContent>
      </CoachAlertDialog>
    </div>
  );
}
