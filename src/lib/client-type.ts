// ----------------------------------------------------------------------------
// I titoli in Manrope del lato cliente (passata 09, README V3)
// ----------------------------------------------------------------------------
// La regola globale di styles.css dà Sora e la spaziatura -0.02em a ogni
// h1-h6. Il disegno vuole Sora solo per i titoli delle schede, del dettaglio e
// dei fogli e per i numeri grandi (che hanno font-display): ogni altro titolo
// (le card e le pagine aperte a 17/700, le etichette di sezione a 14/700, i
// titoli a 15/700) è in Manrope con la spaziatura normale. Un posto solo,
// invece della stessa coppia di classi da ricordare in ogni componente: fino
// alla 08 diciassette titoli erano in Sora per una classe dimenticata.
// ----------------------------------------------------------------------------

/** Manrope con la spaziatura normale: per un h1-h6 che non è un titolo in Sora. */
export const SANS_HEADING = "font-sans tracking-normal";

/** Il titolo di una card, o di una pagina aperta: Manrope 17/700. */
export const CARD_TITLE = `${SANS_HEADING} text-[17px] font-bold`;

/** L'etichetta di una sezione: Manrope 14/700, nel colore secondario. */
export const SECTION_LABEL = `${SANS_HEADING} text-sm font-bold text-on-surface-variant`;
