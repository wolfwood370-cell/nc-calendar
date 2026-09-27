// ----------------------------------------------------------------------------
// Pillola di Google Calendar della Disponibilità desktop (passata 08, D5)
// ----------------------------------------------------------------------------
// Dice solo quello che questo browser sa: l'ultima sincronizzazione riuscita
// (gcal_reconcile_ok). Non chiama Google e non usa useGcalSync, che
// riconcilia al montaggio. Pallino neutro: se Google risponde adesso non lo
// misura nessuno (è la passata 09). La chiave si legge in un effect, non
// nell'inizializzatore di useState (use-gcal-sync.ts spiega perché).
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LAST_SYNC_OK_KEY } from "@/hooks/use-gcal-sync";
import { gcalSyncPillText, parseSyncStamp } from "@/lib/gcal-sync-status";

export function GcalSyncPill() {
  // undefined finché non si è letto il valore.
  const [lastOk, setLastOk] = useState<number | null | undefined>(undefined);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(LAST_SYNC_OK_KEY);
    } catch {
      /* storage non disponibile */
    }
    setLastOk(parseSyncStamp(raw));
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2.5 self-start rounded-2xl border border-surface-variant bg-white px-4 py-3 text-[13px] text-on-surface-variant">
      <span className="size-2 shrink-0 rounded-full bg-outline" aria-hidden />
      <span>{lastOk === undefined ? "Google Calendar" : gcalSyncPillText(lastOk, now)}</span>
      <Link to="/trainer/integrations" className="text-[13px] font-semibold text-aura-primary">
        Gestisci
      </Link>
    </div>
  );
}
