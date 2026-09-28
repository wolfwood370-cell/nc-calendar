// ----------------------------------------------------------------------------
// Elenchi della card di Google Calendar di Integrazioni desktop (passata 09)
// ----------------------------------------------------------------------------
// «Sessioni non su Google» con «Ricrea su Google» (la regola e l'azione del
// Calendario: notOnGoogle, createGoogleEvent) e «Eventi solo su Google» con
// «Importa»: dal desktop è l'unico modo di portare nell'app un evento creato
// su Google, e finché non lo importi non blocca gli orari prenotabili.
// ----------------------------------------------------------------------------

import { Loader2 } from "lucide-react";

export interface MissingRow {
  id: string;
  /** «Cliente · Tipologia». */
  name: string;
  /** «giorno · ora». */
  when: string;
}

export interface GoogleOnlyRow {
  id: string;
  title: string;
  when: string;
}

export function MissingOnGoogleList({
  rows,
  busyId,
  disabled,
  onRepair,
}: {
  rows: readonly MissingRow[];
  /** La riga che si sta ricreando. */
  busyId: string | null;
  /** Un'altra scrittura verso Google in corso. */
  disabled: boolean;
  onRepair: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2" aria-label="Sessioni non su Google">
      {rows.map((m) => (
        <li
          key={m.id}
          className="flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] bg-warning-soft px-3.5 py-2.5"
        >
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-semibold text-on-surface">{m.name}</span>
            <span className="text-xs text-warning-text">{m.when} · non presente su Google</span>
          </div>
          <button
            type="button"
            onClick={() => onRepair(m.id)}
            disabled={disabled}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-aura-primary px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-container disabled:opacity-60 disabled:hover:bg-aura-primary"
          >
            {busyId === m.id && <Loader2 className="size-3 animate-spin" aria-hidden />}
            Ricrea su Google
          </button>
        </li>
      ))}
    </ul>
  );
}

export function GoogleOnlyList({
  rows,
  disabled,
  onImport,
}: {
  rows: readonly GoogleOnlyRow[];
  disabled: boolean;
  onImport: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[13px] font-bold text-on-surface">
          Eventi solo su Google ({rows.length})
        </h3>
        <p className="text-xs leading-normal text-on-surface-variant">
          Creati direttamente su Google: finché non li importi non bloccano gli orari in cui i
          clienti possono prenotare.
        </p>
      </div>
      <ul className="flex flex-col gap-2" aria-label="Eventi solo su Google">
        {rows.map((e) => (
          <li
            key={e.id}
            className="flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] bg-surface-container-low px-3.5 py-2.5"
          >
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[13px] font-semibold text-on-surface">{e.title}</span>
              <span className="text-xs text-outline">{e.when}</span>
            </div>
            <button
              type="button"
              onClick={() => onImport(e.id)}
              disabled={disabled}
              className="flex h-8 shrink-0 items-center rounded-full border border-surface-variant bg-white px-3 text-xs font-semibold text-aura-primary transition-colors hover:border-primary-container disabled:opacity-60 disabled:hover:border-surface-variant"
            >
              Importa
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
