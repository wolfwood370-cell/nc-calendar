// ----------------------------------------------------------------------------
// Le anteprime di Lovable, dove il service worker non si registra (passata 08
// del lato cliente)
// ----------------------------------------------------------------------------
// Il service worker serve alle notifiche sul telefono, e va tenuto fuori solo
// dalle anteprime, dove servirebbe contenuto vecchio. Fino alla 08
// pwa-register.tsx trattava come anteprima ogni host che contiene
// «lovable.app», quindi anche la produzione (nc-calendar.lovable.app): lì il
// service worker veniva tolto a ogni caricamento, e le notifiche sul telefono
// non potevano arrivare a nessuno.
// Le anteprime hanno una forma precisa:
//   - sulle zone di sviluppo di Lovable (lovableproject.com,
//     lovableproject-dev.com e i domini vecchi gpt-eng.com e gptengineer.run)
//     ogni host è un'anteprima;
//   - su lovable.app il primo nome contiene «--» oppure comincia con l'id del
//     progetto, mentre l'app pubblicata no (nc-calendar.lovable.app, o
//     <app>.<workspace>.lovable.app in un workspace). Le forme con l'id sono
//     quelle da cui src/integrations/supabase/previewAuthStorage.ts, il file di
//     Lovable, ricava il progetto (id-preview--<id>,
//     id-preview-<versione>--<id>, project--<id>, project--<id>-dev, l'id in
//     testa); preview--<nome> è l'anteprima col nome scelto, che quel file
//     nomina nel suo commento.
// Un host in più trattato da anteprima costa poco (lì niente notifiche sul
// telefono); la produzione trattata da anteprima le spegneva a tutti.
// Puro: niente window, l'host entra come parametro.
// ----------------------------------------------------------------------------

/** Le zone in cui ogni host è un'anteprima o un ambiente di sviluppo di Lovable. */
const DEV_ZONES = [
  "lovableproject.com",
  "lovableproject-dev.com",
  "gpt-eng.com",
  "gptengineer.run",
];

/** Un UUID v4, l'espressione di previewAuthStorage.ts. */
const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/** L'id del progetto in testa al primo nome, seguito da «-» o dalla fine del nome. */
const PROJECT_ID_FIRST = new RegExp(`^${UUID_V4}(?:-|$)`);

/** L'host è la zona stessa o un suo sottodominio (non un nome che la contiene e basta). */
function inZone(host: string, zone: string): boolean {
  return host === zone || host.endsWith(`.${zone}`);
}

/** Vero per un'anteprima di Lovable: lì il service worker non si registra. */
export function isLovablePreviewHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (DEV_ZONES.some((zone) => inZone(host, zone))) return true;
  if (!inZone(host, "lovable.app")) return false;
  const first = host.split(".")[0] ?? "";
  return first.includes("--") || PROJECT_ID_FIRST.test(first);
}
