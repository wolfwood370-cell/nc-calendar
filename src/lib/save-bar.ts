// ----------------------------------------------------------------------------
// La barra fissa delle modifiche non salvate (Disponibilità e Profilo del
// cliente, desktop)
// ----------------------------------------------------------------------------
// Da md in su sta accanto alla barra laterale. Sotto md, quando la pagina del
// desktop resta montata con una bozza e la finestra si stringe, sta sopra la
// navigazione in basso del telefono (trainer-bottom-nav.tsx: h-16 più la zona
// del gesto), che prima la copriva (passata 11 del lato cliente).
// ----------------------------------------------------------------------------

export const SAVE_BAR_POSITION =
  "fixed left-4 right-4 bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+12px)] md:bottom-6 md:left-[calc(256px+24px)] md:right-6";
