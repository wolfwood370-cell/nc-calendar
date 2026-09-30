// «Riprova» mentre rilegge (passata 05): aria-disabled e non disabled, così il
// pulsante tiene il focus. Si cercano gli attributi scritti per intero,
// virgolette comprese: le classi aria-disabled:… contengono le stesse parole
// in tutti e due gli stati.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BookRetryCard } from "@/components/book-blocked-card";

const html = (retrying: boolean) =>
  renderToStaticMarkup(
    createElement(BookRetryCard, {
      title: "Prenota non si è caricata",
      text: "Non siamo riusciti a leggere i tuoi crediti. Riprova tra poco.",
      onRetry: () => {},
      retrying,
    }),
  );

/** Il tag di apertura di «Riprova». */
const retryTag = (markup: string) => markup.match(/<button[^>]*>Riprova<\/button>/)?.[0] ?? "";

describe("BookRetryCard", () => {
  it("mentre rilegge: aria-disabled, mai disabled", () => {
    const tag = retryTag(html(true));
    expect(tag).not.toBe("");
    expect(tag).toContain('aria-disabled="true"');
    expect(tag).not.toContain(' disabled=""');
  });

  it("ferma: né aria-disabled né disabled", () => {
    const tag = retryTag(html(false));
    expect(tag).not.toBe("");
    expect(tag).not.toContain('aria-disabled="');
    expect(tag).not.toContain(' disabled=""');
  });
});
