import { describe, expect, it } from "vitest";
import { NO_COACH } from "@/lib/client-book";
import { bookCoach, getCoachContacts } from "@/lib/coach-contacts";

describe("getCoachContacts · WhatsApp, telefono ed email del coach", () => {
  it("numero con spazi e prefisso", () => {
    expect(
      getCoachContacts({
        name: "Marco Rossi",
        phone: "+39 347 555 01 23",
        email: "marco@example.com",
      }),
    ).toEqual({
      firstName: "Marco",
      whatsapp: "https://wa.me/393475550123",
      tel: "tel:+393475550123",
      mail: "mailto:marco@example.com",
    });
  });

  it("senza telefono: niente WhatsApp e niente Chiama, resta l'email", () => {
    expect(
      getCoachContacts({ name: "Marco Rossi", phone: null, email: "marco@example.com" }),
    ).toEqual({
      firstName: "Marco",
      whatsapp: null,
      tel: null,
      mail: "mailto:marco@example.com",
    });
  });

  it("numero troppo corto: come senza telefono", () => {
    const c = getCoachContacts({ phone: "12 34" });
    expect(c.whatsapp).toBeNull();
    expect(c.tel).toBeNull();
  });

  it("email presente e assente", () => {
    expect(getCoachContacts({ email: " marco@example.com " }).mail).toBe(
      "mailto:marco@example.com",
    );
    expect(getCoachContacts({ email: null }).mail).toBeNull();
    expect(getCoachContacts({ email: "  " }).mail).toBeNull();
  });

  it("il nome: la prima parola, o niente", () => {
    expect(getCoachContacts({ name: "  Nicolò   Colombo " }).firstName).toBe("Nicolò");
    expect(getCoachContacts({ name: null }).firstName).toBeNull();
    expect(getCoachContacts({}).firstName).toBeNull();
  });
});

// Nessun caso con un numero che comincia con 00: whatsappUrl oggi tiene lo 00
// davanti al prefisso (https://wa.me/0039…), è del lato coach, e un test che lo
// fissasse renderebbe più difficile correggerlo.
describe("bookCoach · il coach dei testi dalla riga di get_my_coach", () => {
  it("il nome senza spazi, il nome di battesimo e il WhatsApp di getCoachContacts", () => {
    expect(
      bookCoach({
        id: "co",
        full_name: " Marco Rossi ",
        phone: "+39 347 555 01 23",
        email: "marco@example.com",
      }),
    ).toEqual({ name: "Marco Rossi", firstName: "Marco", whatsapp: "https://wa.me/393475550123" });
  });

  it("il coach di oggi, senza telefono: il nome sì, il WhatsApp no", () => {
    expect(
      bookCoach({ id: "co", full_name: "Nicolò Castello", phone: null, email: "n@example.com" }),
    ).toEqual({ name: "Nicolò Castello", firstName: "Nicolò", whatsapp: null });
  });

  it("il WhatsApp è sempre https://wa.me/<cifre>, mai il telefono così come arriva", () => {
    expect(
      bookCoach({ id: "co", full_name: "Marco", phone: "javascript:alert(1)", email: null })
        .whatsapp,
    ).toBeNull();
  });

  it("senza riga, o senza nome, è la costante NO_COACH (non una copia)", () => {
    expect(bookCoach(null)).toBe(NO_COACH);
    expect(bookCoach({ id: "co", full_name: "  ", phone: "3475550123", email: null })).toBe(
      NO_COACH,
    );
    expect(bookCoach({ id: "co", full_name: null, phone: null, email: null })).toBe(NO_COACH);
  });
});
