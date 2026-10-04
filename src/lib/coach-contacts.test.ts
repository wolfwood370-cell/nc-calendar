import { describe, expect, it } from "vitest";
import { getCoachContacts } from "@/lib/coach-contacts";

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
