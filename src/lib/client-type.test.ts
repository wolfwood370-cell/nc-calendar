// I titoli in Manrope del lato cliente (passata 09): le classi stanno in un
// posto solo, e la regola globale di styles.css (Sora e -0.02em su ogni
// titolo) vale solo per i titoli che hanno font-display.

import { describe, expect, it } from "vitest";
import { CARD_TITLE, SANS_HEADING, SECTION_LABEL } from "@/lib/client-type";

describe("client-type · i titoli in Manrope", () => {
  it("Manrope con la spaziatura normale, poi la misura del titolo", () => {
    expect(SANS_HEADING).toBe("font-sans tracking-normal");
    expect(CARD_TITLE).toBe("font-sans tracking-normal text-[17px] font-bold");
    expect(SECTION_LABEL).toBe(
      "font-sans tracking-normal text-sm font-bold text-on-surface-variant",
    );
  });
});
