// ----------------------------------------------------------------------------
// Il focus dopo un'azione che toglie il pulsante (lato cliente, passata 09)
// ----------------------------------------------------------------------------
// «Riprova» e «Ripristina» riusciti, e le letture che tornano dopo che la rete
// era ferma, tolgono dalla pagina il pulsante che aveva il focus: il browser
// lo lascia sul body, e chi usa la tastiera o uno screen reader riparte da
// capo. Qui il focus va su un titolo della pagina, ma solo se si era perso, o
// se sta ancora dentro la card da cui è partito («Riprova» che fallisce di
// nuovo: il titolo della card lo annuncia): chi intanto è andato altrove, per
// esempio mentre la rete era ferma, resta dov'è.
// ----------------------------------------------------------------------------

/**
 * Il focus è perso: su nessuno, sul body, su `root` (il contenitore della
 * pagina che lo tiene mentre le sezioni si preparano), o dentro `within` (la
 * card del pulsante che l'aveva).
 */
export function focusIsLost(root?: HTMLElement | null, within?: Element | null): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return (
    !active ||
    active === document.body ||
    (root != null && active === root) ||
    (within != null && within.contains(active))
  );
}

/**
 * Mette il focus su `target` (senza scorrere) solo se si era perso. Se
 * `target` non lo prende (un titolo senza tabIndex lo lascerebbe sul body), lo
 * mette su `root`. Dice se il focus è arrivato su uno dei due.
 */
export function focusIfLost(
  target: HTMLElement | null | undefined,
  root?: HTMLElement | null,
  within?: Element | null,
): boolean {
  if (!target || !focusIsLost(root, within)) return false;
  target.focus({ preventScroll: true });
  if (document.activeElement !== target && root && root !== target) {
    root.focus({ preventScroll: true });
  }
  return document.activeElement === target || (root != null && document.activeElement === root);
}
