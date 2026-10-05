// ----------------------------------------------------------------------------
// ClientSessionRating — la valutazione di una sessione svolta (lato cliente,
// passata 04, audit H9)
// ----------------------------------------------------------------------------
// La card del dettaglio, che la Home (05) riusa con layout="home" (padding 18
// e l'ombra delle card della Home, le stelle centrate con gap 4) e col
// sottotitolo sotto il titolo («… La valutazione arriva al tuo coach.»), nei
// due stati. «Com'è andata?» mentre si sceglie, «La tua valutazione» col voto
// salvato. Le stelle sono un radiogroup con un solo
// punto di Tab (la stella scelta, altrimenti la prima); frecce, Home ed End
// spostano focus e scelta, come gli orari di Prenota (segmentKeyTarget). Dopo
// la scelta compare l'area di testo per la nota; il principale c'è sempre,
// disattivato finché non c'è una stella. Salvata: le stelle in sola lettura,
// la nota fra «», e «Modifica valutazione» solo se si valuta ancora
// (ratingState: entro 14 giorni, creata nell'app).
// Salva useSetSessionFeedback con la nota: senza la colonna note (migrazione
// del 02/10/2026) il voto si salva e il toast lo dice. Quello appena salvato
// si vede subito, finché la rilettura delle valutazioni non lo porta nelle
// props. I colori sono token, nessun esadecimale.
// ----------------------------------------------------------------------------

import { useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { ClientButton } from "@/components/client-button";
import { useSetSessionFeedback } from "@/hooks/use-session-feedback";
import type { BookCoach } from "@/lib/client-book";
import { ratingToast, starsLabel } from "@/lib/client-session-detail";
import { segmentKeyTarget } from "@/lib/segment-keys";
import { cn } from "@/lib/utils";

// La stella del prototipo (Cliente Sessione.dc.html), come nella riga di Sessioni.
const STAR_PATH = "M12 17.3 6.2 21l1.6-6.6L2.4 9.6l6.8-.5L12 3l2.8 6.1 6.8.5-5.4 4.8 1.6 6.6z";
const STARS = [1, 2, 3, 4, 5];

const CARD = "flex flex-col gap-3 rounded-[24px] border border-outline-variant/35 bg-white";

export interface ClientSessionRatingProps {
  bookingId: string;
  clientId: string;
  /** Il voto salvato; null senza. */
  rating: number | null;
  /** La nota salvata; null senza (o finché la colonna non c'è). */
  note: string | null;
  /** ratingState(...).editable: le stelle si scelgono. */
  editable: boolean;
  /** Il coach dei testi (BookCoach): «Grazie: … vedrà la tua valutazione.» */
  coach: BookCoach;
  /** "home": padding 18 e ombra, le stelle centrate con gap 4 (la card della Home, 05). */
  layout: "detail" | "home";
  /** Sotto il titolo, nei due stati: ratingSubtitle della Home; niente riga se manca. */
  subtitle?: string;
}

/** Quello appena salvato, e il voto e la nota delle props in quel momento. */
interface Saved {
  rating: number;
  note: string | null;
  before: { rating: number | null; note: string | null };
}

/** Piena col colore del voto e il suo bordo, vuota col solo bordo. */
function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={STAR_PATH}
        fill={filled ? "var(--color-rating-star)" : "none"}
        stroke={filled ? "var(--color-rating-star-line)" : "var(--color-outline)"}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClientSessionRating({
  bookingId,
  clientId,
  rating,
  note,
  editable,
  coach,
  layout,
  subtitle,
}: ClientSessionRatingProps) {
  const setFeedback = useSetSessionFeedback();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(0);
  const [draft, setDraft] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Il salvataggio vale finché le props sono quelle di prima: la rilettura
  // porta il voto nuovo, e da lì valgono le props.
  const local =
    saved && saved.before.rating === rating && saved.before.note === note ? saved : null;
  const current = local ? local.rating : rating;
  const currentNote = local ? local.note : note;
  const choosing = editable && (editing || current === null);
  if (!choosing && current === null) return null;
  const stars = layout === "home" ? "justify-center gap-1" : "gap-0.5";
  const quoted = currentNote ? `«${currentNote}»` : null;

  const onStarKey = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const target = segmentKeyTarget(e.key, index, STARS.length);
    if (target === null) return;
    e.preventDefault();
    const items = e.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLElement>("[data-star]");
    items?.[target]?.focus();
    setChoice(target + 1);
  };

  const startEditing = () => {
    setChoice(current ?? 0);
    setDraft(currentNote ?? "");
    setEditing(true);
    // «Modifica valutazione» sparisce: il focus va sul titolo della card.
    titleRef.current?.focus({ preventScroll: true });
  };

  const send = () => {
    if (choice === 0) return;
    const value = choice;
    const text = draft.trim() || null;
    const before = { rating, note };
    setFeedback.mutate(
      { booking_id: bookingId, client_id: clientId, rating: value, note: text },
      {
        onSuccess: ({ noteSaved }) => {
          setSaved({ rating: value, note: noteSaved ? text : null, before });
          setEditing(false);
          titleRef.current?.focus({ preventScroll: true });
          if (!noteSaved && text) {
            toast.warning("Valutazione salvata: la nota non si è potuta salvare.");
          } else {
            toast.success(ratingToast(coach));
          }
        },
        onError: (e) => toast.error("Valutazione non salvata", { description: e.message }),
      },
    );
  };

  // Nella Home i titoli delle card sono in Manrope, come le altre card.
  const title = (
    <h2
      ref={titleRef}
      tabIndex={-1}
      className={cn("text-[17px] font-bold", layout === "home" && "font-sans tracking-normal")}
    >
      {choosing ? "Com'è andata?" : "La tua valutazione"}
    </h2>
  );

  return (
    <section className={cn(CARD, layout === "home" ? "p-[18px] shadow-soft-card" : "p-4")}>
      {subtitle ? (
        <div className="flex flex-col gap-1">
          {title}
          <p className="text-sm leading-[1.45] text-on-surface-variant">{subtitle}</p>
        </div>
      ) : (
        title
      )}
      {choosing ? (
        <>
          <div role="radiogroup" aria-label="Valutazione da 1 a 5" className={cn("flex", stars)}>
            {STARS.map((n, i) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === choice}
                aria-label={starsLabel(n)}
                tabIndex={n === (choice || 1) ? 0 : -1}
                data-star
                onClick={() => setChoice(n)}
                onKeyDown={onStarKey(i)}
                className="grid size-12 place-items-center rounded-full"
              >
                <Star filled={n <= choice} />
              </button>
            ))}
          </div>
          {choice > 0 && (
            <textarea
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Nota per il coach, facoltativa"
              placeholder="Vuoi aggiungere qualcosa? (facoltativo)"
              className="w-full resize-none rounded-[14px] border border-outline-variant bg-white px-3.5 py-3 text-[15px] leading-[1.4] text-on-surface placeholder:text-outline"
            />
          )}
          <ClientButton
            fullWidth
            disabled={choice === 0}
            busy={setFeedback.isPending}
            onClick={send}
          >
            {current === null ? "Invia valutazione" : "Aggiorna valutazione"}
          </ClientButton>
        </>
      ) : (
        <>
          <div role="img" aria-label={`Valutata ${current} su 5`} className={cn("flex", stars)}>
            {STARS.map((n) => (
              <span key={n} className="grid size-12 place-items-center">
                <Star filled={current !== null && n <= current} />
              </span>
            ))}
          </div>
          {quoted && <p className="text-sm leading-normal text-on-surface-variant">{quoted}</p>}
          {editable && (
            <ClientButton
              variant="text"
              className="self-start px-0 text-sm font-bold"
              onClick={startEditing}
            >
              Modifica valutazione
            </ClientButton>
          )}
        </>
      )}
    </section>
  );
}
