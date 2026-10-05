// ----------------------------------------------------------------------------
// Le card di Prenota al posto della prenotazione (lato cliente, passata 02)
// ----------------------------------------------------------------------------
//   - BookBlockedCard: quando non si prenota (getBookState.blocked): percorso
//     concluso, nessun credito, crediti usati. Col Booster, «Acquista un
//     Booster»; il WhatsApp del coach solo col link;
//   - BookRetryCard: una lettura fallita, con «Riprova». Mai la card dei
//     crediti per una lettura fallita: direbbe il falso. Mentre rilegge il
//     pulsante è aria-disabled e non disabled: resta nell'albero, tiene il
//     focus (a un pulsante disabled il browser lo toglie) e dice che è
//     occupato; il tocco si ignora (passata 05).
// Card bianca, raggio 24, bordo e ombra delle card, padding 20, gap 12.
// ----------------------------------------------------------------------------

import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import type { Ref } from "react";
import { ClientButton } from "@/components/client-button";
import type { Blocked } from "@/lib/client-book";
import { CARD_TITLE } from "@/lib/client-type";

const CARD =
  "flex flex-col gap-3 rounded-[24px] border border-outline-variant/35 bg-white p-5 shadow-soft-card";

export interface BookBlockedCardProps {
  blocked: Blocked;
  /** Il link WhatsApp del coach, o null: senza, niente pulsante. */
  whatsapp: string | null;
  /** writeToCoach: «Scrivi a Nicolò». */
  whatsappLabel: string;
  /** Il titolo (tabIndex -1): lì torna il focus quando serve. */
  titleRef?: Ref<HTMLHeadingElement>;
}

export function BookBlockedCard({
  blocked,
  whatsapp,
  whatsappLabel,
  titleRef,
}: BookBlockedCardProps) {
  return (
    <section className={CARD}>
      <h2 ref={titleRef} tabIndex={-1} className={CARD_TITLE}>
        {blocked.title}
      </h2>
      <p className="text-[15px] leading-normal text-on-surface-variant">{blocked.text}</p>
      {blocked.buy && (
        <ClientButton asChild fullWidth>
          <Link to="/client/store">Acquista un Booster</Link>
        </ClientButton>
      )}
      {whatsapp && (
        <ClientButton asChild fullWidth variant="secondary">
          <a href={whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-4" aria-hidden />
            {whatsappLabel}
          </a>
        </ClientButton>
      )}
    </section>
  );
}

export interface BookRetryCardProps {
  title: string;
  text: string;
  onRetry: () => void;
  /** Rilegge: il pulsante resta occupato (aria-disabled) finché non torna la risposta. */
  retrying?: boolean;
  titleRef?: Ref<HTMLHeadingElement>;
}

export function BookRetryCard({ title, text, onRetry, retrying, titleRef }: BookRetryCardProps) {
  return (
    <section className={CARD}>
      <h2 ref={titleRef} tabIndex={-1} className={CARD_TITLE}>
        {title}
      </h2>
      <p className="text-[15px] leading-normal text-on-surface-variant">{text}</p>
      <ClientButton
        variant="secondary"
        fullWidth
        aria-disabled={retrying || undefined}
        onClick={() => {
          if (!retrying) onRetry();
        }}
        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      >
        Riprova
      </ClientButton>
    </section>
  );
}
