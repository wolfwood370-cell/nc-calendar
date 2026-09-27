import { describe, expect, it } from "vitest";
import {
  GCAL_COLORS,
  TYPE_PALETTE,
  contrastWithWhite,
  lowContrastOnWhite,
  nameForColor,
} from "@/lib/event-colors";
import {
  BUFFER_GRID,
  CURRENT_COLOR_NAME,
  DURATION_GRID,
  bookableHint,
  bufferOptions,
  colorOptions,
  durationOptions,
  lacksGoogleColor,
  locationLabel,
  nameProblem,
  stepValue,
} from "@/lib/event-type-rules";

describe("−/+ della card", () => {
  it("durata: passo 15, da 15 a 240", () => {
    expect(stepValue(60, 1, DURATION_GRID)).toBe(75);
    expect(stepValue(60, -1, DURATION_GRID)).toBe(45);
    expect(stepValue(225, 1, DURATION_GRID)).toBe(240);
    expect(stepValue(30, -1, DURATION_GRID)).toBe(15);
  });

  it("margine: passo 5, da 0 a 60", () => {
    expect(stepValue(10, 1, BUFFER_GRID)).toBe(15);
    expect(stepValue(10, -1, BUFFER_GRID)).toBe(5);
    expect(stepValue(5, -1, BUFFER_GRID)).toBe(0);
  });

  it("al limite il pulsante è disabilitato (null)", () => {
    expect(stepValue(240, 1, DURATION_GRID)).toBeNull();
    expect(stepValue(15, -1, DURATION_GRID)).toBeNull();
    expect(stepValue(60, 1, BUFFER_GRID)).toBeNull();
    expect(stepValue(0, -1, BUFFER_GRID)).toBeNull();
  });

  it("fuori griglia: il multiplo successivo nella direzione del clic", () => {
    expect(stepValue(50, 1, DURATION_GRID)).toBe(60);
    expect(stepValue(50, -1, DURATION_GRID)).toBe(45);
    expect(stepValue(7, 1, BUFFER_GRID)).toBe(10);
    expect(stepValue(7, -1, BUFFER_GRID)).toBe(5);
  });

  it("fuori dai limiti: si rientra, oltre non si va", () => {
    expect(stepValue(10, 1, DURATION_GRID)).toBe(15);
    expect(stepValue(10, -1, DURATION_GRID)).toBeNull();
    expect(stepValue(250, -1, DURATION_GRID)).toBe(240);
    expect(stepValue(250, 1, DURATION_GRID)).toBeNull();
    expect(stepValue(90, -1, BUFFER_GRID)).toBe(60);
    expect(stepValue(90, 1, BUFFER_GRID)).toBeNull();
  });
});

describe("palette e contrasto", () => {
  it("12 cerchi: Blu studio più gli 11 di Google coi nomi italiani e gli hex di sempre", () => {
    expect(TYPE_PALETTE).toHaveLength(12);
    expect(TYPE_PALETTE[0]).toEqual({ name: "Blu studio", hex: "#003e62" });
    expect(GCAL_COLORS.map((c) => c.name)).toEqual([
      "Pomodoro",
      "Fenicottero",
      "Mandarino",
      "Banana",
      "Salvia",
      "Basilico",
      "Pavone",
      "Mirtillo",
      "Lavanda",
      "Uva",
      "Grafite",
    ]);
    expect(nameForColor("#33b864")).toBe("Salvia");
    expect(nameForColor("#33b679")).toBeUndefined();
    expect(nameForColor("#003e62")).toBeUndefined(); // il telefono resta a 11 cerchi
  });

  it("l'avviso esce esattamente per Fenicottero, Banana e Salvia", () => {
    expect(TYPE_PALETTE.filter((c) => lowContrastOnWhite(c.hex)).map((c) => c.name)).toEqual([
      "Fenicottero",
      "Banana",
      "Salvia",
    ]);
    const ratio = (name: string) =>
      contrastWithWhite(TYPE_PALETTE.find((c) => c.name === name)!.hex);
    expect(ratio("Fenicottero")).toBeCloseTo(2.8, 2);
    expect(ratio("Banana")).toBeCloseTo(1.69, 2);
    expect(ratio("Salvia")).toBeCloseTo(2.57, 2);
    expect(ratio("Pavone")).toBeCloseTo(3.08, 2);
  });

  it("nota di Google per i colori senza corrispondente", () => {
    expect(lacksGoogleColor("#003e62")).toBe(true);
    expect(lacksGoogleColor("#33B864")).toBe(false);
    expect(lacksGoogleColor("#F6BF26")).toBe(false);
  });
});

describe("nome", () => {
  const types = [
    { id: "pt", name: "Sessione PT" },
    { id: "bia", name: "Misurazione BIA" },
  ];

  it("vuoto", () => {
    expect(nameProblem("", null, types)).toBe("empty");
    expect(nameProblem("   ", null, types)).toBe("empty");
  });

  it("doppione senza maiuscole e senza spazi ai lati, esclusa la tipologia stessa", () => {
    expect(nameProblem("  misurazione bia ", null, types)).toBe("duplicate");
    expect(nameProblem("MISURAZIONE BIA", { id: "pt", name: "Sessione PT" }, types)).toBe(
      "duplicate",
    );
    expect(
      nameProblem("misurazione bia", { id: "bia", name: "Misurazione BIA" }, types),
    ).toBeNull();
    expect(nameProblem("Consulenza", null, types)).toBeNull();
  });

  it("il nome lasciato com'è va sempre bene, anche con un doppione già esistente", () => {
    const withDup = [...types, { id: "pt2", name: "Sessione PT" }];
    expect(nameProblem("Sessione PT", { id: "pt", name: "Sessione PT" }, withDup)).toBeNull();
    expect(nameProblem("Sessione PT", { id: "bia", name: "Misurazione BIA" }, withDup)).toBe(
      "duplicate",
    );
  });

  it("bloccato se il negozio vende la tipologia col suo nome", () => {
    const self = { id: "pt", name: "Sessione PT" };
    expect(nameProblem("Personal Training", self, types, ["Sessione PT"])).toBe("locked");
    expect(nameProblem(" Sessione PT ", self, types, ["Sessione PT"])).toBeNull();
    expect(nameProblem("Personal Training", self, types, ["Test Funzionali"])).toBeNull();
  });
});

describe("segmenti del dialog: il valore attuale non si perde", () => {
  it("durata fuori dai segmenti (la BIA di oggi: 15 minuti)", () => {
    expect(durationOptions(15).map((o) => o.label)).toEqual([
      "15m",
      "30m",
      "45m",
      "1h",
      "1h 30m",
      "2h",
    ]);
    expect(durationOptions(60).map((o) => o.value)).toEqual([30, 45, 60, 90, 120]);
  });

  it("margine fuori dai segmenti", () => {
    expect(bufferOptions(20).map((o) => o.label)).toEqual([
      "0 min",
      "5 min",
      "10 min",
      "15 min",
      "20 min",
    ]);
    expect(bufferOptions(10)).toHaveLength(4);
  });

  it("colore fuori palette: tredicesimo cerchio", () => {
    const opts = colorOptions("#123456");
    expect(opts).toHaveLength(13);
    expect(opts[12]).toEqual({ name: CURRENT_COLOR_NAME, hex: "#123456" });
    expect(colorOptions("#33b864")).toHaveLength(12);
    expect(colorOptions("#003E62")).toHaveLength(12);
  });
});

describe("testi della card", () => {
  it("interruttore: una tipologia non prenotabile non è nascosta", () => {
    expect(bookableHint({ client_bookable: true, unavailable_message: "x" })).toBe(
      "I clienti la vedono tra le sessioni prenotabili.",
    );
    expect(
      bookableHint({ client_bookable: false, unavailable_message: " Scrivimi su WhatsApp. " }),
    ).toBe(
      "I clienti la vedono ma non possono prenotarla dall'app. Messaggio: «Scrivimi su WhatsApp.»",
    );
    expect(bookableHint({ client_bookable: false, unavailable_message: null })).toBe(
      "I clienti la vedono ma non possono prenotarla dall'app: solo tu puoi fissarla.",
    );
  });

  it("luogo", () => {
    expect(locationLabel({ location_type: "physical", location_address: "Via Roma 1" })).toBe(
      "In studio · Via Roma 1",
    );
    expect(locationLabel({ location_type: "physical", location_address: null })).toBe(
      "In studio · indirizzo non impostato",
    );
    expect(locationLabel({ location_type: "online", location_address: null })).toBe(
      "Online · link Meet creato alla prenotazione",
    );
  });
});
