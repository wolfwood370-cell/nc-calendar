// ----------------------------------------------------------------------------
// Tab «Sessioni» del Profilo desktop (passata 06, K3 e K6)
// ----------------------------------------------------------------------------
// «Sessioni fuori percorso» (ex «Sessioni da revisionare»): «Collega» prende
// il credito come «Assegna evento» (blocco della data, poi extra) e il testo
// dice quale blocco; «Ignora» come prima. Sotto: filtro con i conteggi
// (Tutte · Programmate · Svolte · Assenze · Annullate, che comprende le
// annullate tardi) ed elenco completo; clic → modifica.
// ----------------------------------------------------------------------------

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { card } from "@/components/profile-styles";
import { StatusChip } from "@/components/profile-ui";
import { SegmentedControl } from "@/components/segmented-control";
import { localTime } from "@/lib/calendar-time";
import {
  SESSION_FILTERS,
  inSessionFilter,
  longDay,
  orphanLinkLabel,
  sessionFilterCounts,
  type SessionFilter,
  typeInfo,
} from "@/lib/client-profile";
import type { ProfileBlock, ProfileBooking, ProfileOrphan } from "@/lib/profile-load";
import type { EventTypeRow } from "@/lib/queries";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";

export interface ProfileSessionsProps {
  bookings: readonly ProfileBooking[];
  orphans: readonly ProfileOrphan[];
  blocks: readonly ProfileBlock[];
  eventTypes: readonly EventTypeRow[];
  now: Date;
  busy: string | null;
  onLink: (o: ProfileOrphan) => void;
  onIgnore: (o: ProfileOrphan) => void;
  onEdit: (b: ProfileBooking) => void;
}

export function ProfileSessions({
  bookings,
  orphans,
  blocks,
  eventTypes,
  now,
  busy,
  onLink,
  onIgnore,
  onEdit,
}: ProfileSessionsProps) {
  const [filter, setFilter] = useState<SessionFilter>("all");
  const counts = sessionFilterCounts(bookings);
  const shown = bookings.filter((b) => inSessionFilter(b.status, filter));

  return (
    <div className="flex flex-col gap-5">
      {orphans.length > 0 && (
        <section className="flex flex-col gap-2.5 rounded-[24px] border border-dashed border-[#f59e0b] bg-surface-container-lowest px-5 py-[18px]">
          <h2 className="m-0 text-base font-bold text-on-surface">Sessioni fuori percorso</h2>
          <p className="m-0 text-[13px] leading-normal text-on-surface-variant">
            Importate da Google e non collegate a un blocco. Collegale per scalare il credito,
            oppure ignorale.
          </p>
          {orphans.map((o) => (
            <div
              key={o.id}
              className="flex flex-wrap items-center gap-3 border-t border-surface-container-low py-2.5"
            >
              <div className="flex min-w-[220px] flex-1 flex-col">
                <span className="text-sm font-semibold text-on-surface">
                  {o.title?.trim() || "Sessione importata"}
                </span>
                <span className="text-xs text-outline">
                  {longDay(o.scheduled_at)} · {localTime(new Date(o.scheduled_at))}
                </span>
              </div>
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => onLink(o)}
                className="h-[34px] rounded-full bg-aura-primary px-3.5 text-[13px] font-semibold text-white hover:bg-primary-container disabled:opacity-60"
              >
                {orphanLinkLabel(blocks, o.scheduled_at, now)}
              </button>
              <button
                type="button"
                disabled={busy === o.id}
                onClick={() => onIgnore(o)}
                className="h-[34px] rounded-full px-3.5 text-[13px] font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-60"
              >
                Ignora
              </button>
            </div>
          ))}
        </section>
      )}

      <SegmentedControl
        ariaLabel="Filtra sessioni"
        className="w-fit flex-wrap"
        value={filter}
        onChange={setFilter}
        options={SESSION_FILTERS.map((f) => ({
          value: f.value,
          label: (
            <>
              {f.label}
              <span className="tabular-nums text-on-surface-variant">{counts[f.value]}</span>
            </>
          ),
        }))}
      />

      <section className={cn(card, "px-5 py-2")}>
        {shown.map((b, i) => {
          const t = typeInfo(eventTypes, b.event_type_id, b.session_type);
          const at = new Date(b.scheduled_at);
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onEdit(b)}
              className={cn(
                "flex w-full items-center gap-3.5 py-3 text-left",
                i > 0 && "border-t border-surface-container-low",
              )}
            >
              <span
                aria-hidden
                className="h-9 w-1 shrink-0 rounded-full"
                style={{ background: t.color }}
              />
              <span className="w-[150px] shrink-0 text-sm font-semibold tabular-nums text-on-surface">
                {format(at, "EEE d MMM", { locale: it })} · {localTime(at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-on-surface-variant">
                {t.name}
              </span>
              <StatusChip status={b.status} />
              <ChevronRight className="size-4 text-outline-variant" aria-hidden />
            </button>
          );
        })}
        {shown.length === 0 && (
          <p className="m-0 py-5 text-sm text-on-surface-variant">
            Nessuna sessione con questo filtro.
          </p>
        )}
      </section>
    </div>
  );
}
