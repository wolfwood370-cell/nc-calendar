// La valutazione della sessione (passata 04), resa sul server come
// client-session-row.test.ts, dentro un QueryClientProvider: il salvataggio è
// useSetSessionFeedback, cioè useMutation.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ClientSessionRating,
  type ClientSessionRatingProps,
} from "@/components/client-session-rating";
import { NO_COACH } from "@/lib/client-book";

const BASE: ClientSessionRatingProps = {
  bookingId: "d7",
  clientId: "giulia",
  rating: null,
  note: null,
  editable: true,
  coach: NO_COACH,
  layout: "detail",
};

const html = (props: Partial<ClientSessionRatingProps> = {}) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(ClientSessionRating, { ...BASE, ...props }),
    ),
  );

/** I tag di apertura delle stelle, nell'ordine. */
const radios = (markup: string) => markup.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];

describe("ClientSessionRating", () => {
  it("da valutare: il radiogroup, cinque stelle col nome e «Invia valutazione» disattivato", () => {
    const markup = html();
    expect(markup).toContain(">Com&#x27;è andata?<");
    expect(markup).toContain('role="radiogroup"');
    expect(markup).toContain('aria-label="Valutazione da 1 a 5"');
    const stars = radios(markup);
    expect(stars).toHaveLength(5);
    const names = ["1 stella", "2 stelle", "3 stelle", "4 stelle", "5 stelle"];
    stars.forEach((tag, i) => {
      expect(tag).toContain(`aria-label="${names[i]}"`);
      expect(tag).toContain('aria-checked="false"');
    });
    expect(stars.filter((tag) => tag.includes('tabindex="0"'))).toHaveLength(1);
    const send = markup.match(/<button[^>]*>Invia valutazione<\/button>/)?.[0];
    expect(send).toBeDefined();
    expect(send).toContain(' disabled=""');
    expect(markup).not.toContain("<textarea");
  });

  it("salvata e modificabile: il voto in sola lettura, la nota fra «» e «Modifica valutazione»", () => {
    const markup = html({ rating: 4, note: "Ottima sessione" });
    expect(markup).toContain(">La tua valutazione<");
    expect(markup).toContain('aria-label="Valutata 4 su 5"');
    expect(markup).toContain("«Ottima sessione»");
    expect(markup).toContain(">Modifica valutazione<");
    expect(markup).not.toContain('role="radiogroup"');
    expect(markup.match(/fill="var\(--color-rating-star\)"/g)).toHaveLength(4);
  });

  it("salvata e non più modificabile: niente «Modifica valutazione»", () => {
    const markup = html({ rating: 5, note: null, editable: false });
    expect(markup).toContain(">La tua valutazione<");
    expect(markup).toContain('aria-label="Valutata 5 su 5"');
    expect(markup).not.toContain("Modifica valutazione");
    expect(markup).not.toContain("«");
  });
});
