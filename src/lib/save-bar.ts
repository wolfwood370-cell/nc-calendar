// ----------------------------------------------------------------------------
// La barra fissa delle modifiche non salvate (Disponibilità e Profilo del
// cliente, desktop)
// ----------------------------------------------------------------------------
// Da md in su sta accanto alla barra laterale. Sotto md, quando la pagina del
// desktop resta montata con una bozza e la finestra si stringe, sta sopra la
// navigazione in basso del telefono (trainer-bottom-nav.tsx: h-16 più la zona
// del gesto), che prima la copriva (passata 11 del lato cliente). Da md in su,
// sul telefono in orizzontale, tiene la tacca ai lati e la zona del gesto in
// basso: il layout del coach sposta la barra laterale del margine di sinistra
// (passata 12, trainer.tsx), e la barra la segue.
// ----------------------------------------------------------------------------

export const SAVE_BAR_POSITION =
  "fixed left-[calc(16px+env(safe-area-inset-left,0px))] right-[calc(16px+env(safe-area-inset-right,0px))] bottom-[calc(4rem+env(safe-area-inset-bottom,0px)+12px)] md:bottom-[calc(24px+env(safe-area-inset-bottom,0px))] md:left-[calc(256px+24px+env(safe-area-inset-left,0px))] md:right-[calc(24px+env(safe-area-inset-right,0px))]";
