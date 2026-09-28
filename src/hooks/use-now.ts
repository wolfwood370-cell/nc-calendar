// ----------------------------------------------------------------------------
// L'ora che scorre, una per tutte le pagine del coach (audit V8, passata 10)
// ----------------------------------------------------------------------------
// Panoramica e Calendario avevano ognuna la sua copia di useNow; la lista
// Clienti leggeva new Date() dentro un useMemo che dipendeva solo dai dati, e
// il suo orologio restava fermo finché i dati non cambiavano. Ora Panoramica,
// Calendario, Clienti e Profilo leggono l'ora da qui: gli stati delle
// sessioni cambiano insieme, senza ricaricare.
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";

/** Ogni quanto l'ora avanza: il passo più piccolo che cambia uno stato è il minuto. */
export const CLOCK_TICK_MS = 30_000;

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
}
