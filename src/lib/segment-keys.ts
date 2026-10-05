// ----------------------------------------------------------------------------
// Tastiera dei controlli segmentati e dei tab (audit O3)
// ----------------------------------------------------------------------------
// Tab entra nel gruppo, le frecce spostano la scelta, Home ed End vanno al
// primo e all'ultimo elemento; la scelta si applica subito. Le frecce
// verticali valgono come quelle orizzontali: il brief chiede «le frecce»
// senza distinguere. Lo usa segmented-control.tsx, che con kind="tabs" e
// idBase dà ai tab gli id di tabId e il pannello di tabPanelId (passata 09:
// stanno qui e non nel componente, che deve esportare solo componenti).
// ----------------------------------------------------------------------------

/**
 * Indice del segmento da scegliere dopo un tasto, o null se il tasto non è
 * del gruppo. Le frecce girano in tondo; Home ed End vanno agli estremi.
 */
export function segmentKeyTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowLeft":
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

/** L'id del tab di `value` nel gruppo `idBase` (kind="tabs"). */
export function tabId(idBase: string, value: string): string {
  return `${idBase}-tab-${value}`;
}

/** L'id del pannello che i tab del gruppo `idBase` controllano. */
export function tabPanelId(idBase: string): string {
  return `${idBase}-panel`;
}
