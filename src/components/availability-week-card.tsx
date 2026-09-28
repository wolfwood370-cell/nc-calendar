// ----------------------------------------------------------------------------
// «Orario settimanale» della Disponibilità desktop (passata 08, D3)
// ----------------------------------------------------------------------------
// Righe da lunedì a domenica: interruttore e nome, fasce con due select
// (06:00-22:00 ogni 30 minuti, più il valore salvato se è fuori) e cestino,
// errori sotto la riga col bordo rosso sui select. «+ Fascia» e «Copia su…»
// sui giorni accesi. Le regole stanno in availability-week.ts: qui solo la
// vista, che passa ogni modifica alla pagina.
// ----------------------------------------------------------------------------

import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  WEEK_DAYS,
  addRange,
  copyDay,
  removeRange,
  timeOptionsWith,
  toggleDay,
  updateRange,
  weekdayTargets,
  type Dow,
  type WeekDraft,
} from "@/lib/availability-week";
import { cn } from "@/lib/utils";

const SELECT =
  "h-[38px] rounded-full border-[1.5px] bg-surface-container-low px-3 text-sm font-semibold tabular-nums text-on-surface disabled:opacity-60";

const ROW_ACTION =
  "flex h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors hover:bg-surface-container disabled:opacity-60";

function TimeSelect({
  value,
  label,
  invalid,
  disabled,
  onChange,
}: {
  value: string;
  label: string;
  invalid: boolean;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(SELECT, invalid ? "border-danger-text/50" : "border-transparent")}
    >
      {timeOptionsWith(value).map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

function CopyPopover({
  source,
  label,
  disabled,
  onApply,
}: {
  source: Dow;
  label: string;
  disabled: boolean;
  onApply: (targets: Dow[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Dow[]>([]);
  const others = WEEK_DAYS.filter((d) => d.dow !== source);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        setTargets([]);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Copia su… gli orari di ${label}`}
          className={cn(ROW_ACTION, "text-on-surface-variant")}
        >
          <Copy className="size-3.5" aria-hidden />
          Copia su…
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="flex w-60 flex-col gap-1.5 rounded-2xl border-surface-container bg-white p-3 shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
      >
        <p className="px-1 pb-1 text-xs font-bold text-outline">Copia gli orari di {label} su</p>
        {others.map((d) => {
          const checked = targets.includes(d.dow);
          return (
            <button
              key={d.dow}
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() =>
                setTargets((t) => (checked ? t.filter((x) => x !== d.dow) : [...t, d.dow]))
              }
              className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-[7px] text-left text-sm text-on-surface hover:bg-surface-container-low"
            >
              <span
                className={cn(
                  "grid size-[18px] place-items-center rounded-[5px] border-2 text-white",
                  checked
                    ? "border-aura-primary bg-aura-primary"
                    : "border-outline-variant bg-white",
                )}
                aria-hidden
              >
                <Check className="size-[11px]" strokeWidth={3} />
              </span>
              {d.label}
            </button>
          );
        })}
        <div className="flex items-center justify-between gap-2 border-t border-surface-container-low pt-1.5">
          <button
            type="button"
            onClick={() => setTargets(weekdayTargets(source))}
            className="text-xs font-semibold text-aura-primary"
          >
            Lun–Ven
          </button>
          <button
            type="button"
            disabled={targets.length === 0}
            onClick={() => {
              onApply(targets);
              setOpen(false);
              setTargets([]);
            }}
            className="h-8 rounded-full bg-aura-primary px-3.5 text-[13px] font-semibold text-white disabled:bg-outline-variant"
          >
            Applica
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AvailabilityWeekCard({
  week,
  errors,
  disabled,
  onChange,
}: {
  week: WeekDraft;
  errors: Partial<Record<Dow, string>>;
  disabled: boolean;
  onChange: (next: (w: WeekDraft) => WeekDraft) => void;
}) {
  return (
    <div className="flex flex-col">
      {WEEK_DAYS.map((d, i) => {
        const day = week[d.dow];
        const error = errors[d.dow];
        return (
          <div
            key={d.dow}
            className={cn(
              "flex flex-wrap items-start gap-3.5 py-3.5",
              i > 0 && "border-t border-surface-container-low",
            )}
          >
            <label className="flex w-[140px] shrink-0 cursor-pointer items-center gap-2.5 pt-1.5">
              <Switch
                checked={day.active}
                disabled={disabled}
                onCheckedChange={(v) => onChange((w) => toggleDay(w, d.dow, v))}
                aria-label={`${day.active ? "Disattiva" : "Attiva"} ${d.label}`}
                className="h-[22px] w-9 data-[state=checked]:bg-aura-primary data-[state=unchecked]:bg-outline-variant"
              />
              <span
                className={cn(
                  "text-sm font-semibold",
                  day.active ? "text-on-surface" : "text-outline",
                )}
              >
                {d.label}
              </span>
            </label>

            <div className="flex min-w-0 flex-[1_1_220px] flex-col gap-2">
              {!day.active && <p className="pt-2 text-sm text-outline">Non disponibile</p>}
              {day.active &&
                day.ranges.map((r, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <TimeSelect
                      value={r.start}
                      label={`${d.label}, inizio fascia ${j + 1}`}
                      invalid={!!error}
                      disabled={disabled}
                      onChange={(v) => onChange((w) => updateRange(w, d.dow, j, "start", v))}
                    />
                    <span className="text-outline" aria-hidden>
                      –
                    </span>
                    <TimeSelect
                      value={r.end}
                      label={`${d.label}, fine fascia ${j + 1}`}
                      invalid={!!error}
                      disabled={disabled}
                      onChange={(v) => onChange((w) => updateRange(w, d.dow, j, "end", v))}
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onChange((w) => removeRange(w, d.dow, j))}
                      aria-label={`Rimuovi la fascia ${r.start}–${r.end} di ${d.label}`}
                      className="grid size-[34px] place-items-center rounded-full text-outline transition-colors hover:bg-danger-soft hover:text-danger-text disabled:opacity-60"
                    >
                      <Trash2 className="size-[15px]" aria-hidden />
                    </button>
                  </div>
                ))}
              {error && (
                <p role="alert" className="text-xs font-semibold text-danger-text">
                  {error}
                </p>
              )}
            </div>

            {day.active && (
              <div className="flex gap-1 pt-0.5">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange((w) => addRange(w, d.dow))}
                  aria-label={`Aggiungi una fascia a ${d.label}`}
                  className={cn(ROW_ACTION, "text-aura-primary")}
                >
                  <Plus className="size-3.5" aria-hidden />
                  Fascia
                </button>
                <CopyPopover
                  source={d.dow}
                  label={d.label}
                  disabled={disabled}
                  onApply={(targets) => onChange((w) => copyDay(w, d.dow, targets))}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
