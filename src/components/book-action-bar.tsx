// ----------------------------------------------------------------------------
// BookActionBar — la barra d'azione di Prenota (lato cliente, passata 02,
// audit N4)
// ----------------------------------------------------------------------------
// C'è solo con un orario scelto: a sinistra la tipologia e quando, a destra
// «Continua», che apre il riepilogo. Sta fra il contenuto e la barra in basso,
// e il contenuto non ci finisce mai sotto.
// È sticky e non fixed: dentro la pagina un fixed scorrerebbe col contenuto
// (il div.page-enter del layout ha un transform, passata 01), e con un portal
// nel body «Continua» verrebbe dopo le schede della barra nell'ordine di Tab.
// La pagina la mette per ultima in una colonna alta almeno quanto lo schermo
// (mt-auto la spinge in fondo): così anche con poco contenuto sta attaccata.
// Le misure sono quelle del layout (client.tsx): sotto md la barra in basso è
// alta 65 px più max(6px, safe area) e sotto il contenuto il layout tiene
// quell'altezza più 24; da md niente barra, e 24 più la safe area. Il margine
// negativo di 24 fa arrivare la barra, in fondo alla pagina, esattamente
// sopra la barra in basso (da md, sopra la safe area).
// ----------------------------------------------------------------------------

import { ClientButton } from "@/components/client-button";

export interface BookActionBarProps {
  /** barType: «Sessione PT · 60 min». */
  type: string;
  /** barWhen: «mar 29 set · 11:10–12:10». */
  when: string;
  onContinue: () => void;
}

export function BookActionBar({ type, when, onContinue }: BookActionBarProps) {
  return (
    <div className="sticky bottom-[calc(65px_+_max(6px,env(safe-area-inset-bottom)))] z-20 mt-auto -mb-6 flex items-center gap-3 border-t border-outline-variant/45 bg-white px-4 py-2.5 md:bottom-[env(safe-area-inset-bottom)]">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13px] text-on-surface-variant">{type}</span>
        <span className="text-base font-bold text-on-surface tabular-nums">{when}</span>
      </div>
      <ClientButton onClick={onContinue}>Continua</ClientButton>
    </div>
  );
}
