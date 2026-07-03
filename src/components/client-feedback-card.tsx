// ----------------------------------------------------------------------------
// ClientFeedbackCard — "Com'è andata?" stelle 1..5 post-sessione
// ----------------------------------------------------------------------------
// Design handoff (Client Dashboard): card bianca con 5 stelle 30px
// (attive #f5a623, spente #d7dbe0). Mostrata dal genitore per l'ultima
// sessione completata senza feedback; al voto salva su session_feedback e
// la card scompare alla successiva invalidazione della query.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { toast } from "sonner";
import { useSetSessionFeedback } from "@/hooks/use-session-feedback";

const STAR_PATH = "M12 17.3 6.2 21l1.6-6.6L2.4 9.6l6.8-.5L12 3l2.8 6.1 6.8.5-5.4 4.8 1.6 6.6z";

export function ClientFeedbackCard({
  bookingId,
  clientId,
  typeLabel,
  dateLabel,
}: {
  bookingId: string;
  clientId: string;
  typeLabel: string;
  dateLabel: string;
}) {
  const [hover, setHover] = useState(0);
  const [chosen, setChosen] = useState(0);
  const setFeedback = useSetSessionFeedback();

  const active = hover || chosen;

  return (
    <section className="bg-surface-container-lowest rounded-card-mobile shadow-soft-card border border-outline-variant/30 p-6 text-center">
      <h3 className="font-display text-base font-bold text-on-surface m-0 mb-1">Com'è andata?</h3>
      <p className="text-[13px] text-outline m-0 mb-3.5">
        {typeLabel} · {dateLabel}. Il tuo feedback aiuta il coach.
      </p>
      <div className="flex gap-2 justify-center" role="radiogroup" aria-label="Valuta la sessione">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={chosen === i}
            aria-label={`${i} stelle`}
            disabled={setFeedback.isPending || chosen > 0}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(0)}
            onClick={() => {
              setChosen(i);
              setFeedback.mutate(
                { booking_id: bookingId, client_id: clientId, rating: i },
                {
                  onSuccess: () => toast.success("Grazie per il feedback!"),
                  onError: (e) => {
                    setChosen(0);
                    toast.error("Feedback non salvato", { description: e.message });
                  },
                },
              );
            }}
            className="p-0.5 transition-colors"
            style={{ color: i <= active ? "#f5a623" : "#d7dbe0" }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d={STAR_PATH} />
            </svg>
          </button>
        ))}
      </div>
    </section>
  );
}
