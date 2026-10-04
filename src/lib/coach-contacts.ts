// ----------------------------------------------------------------------------
// Contatti del coach (lato cliente, passata 00, audit H6)
// ----------------------------------------------------------------------------
// Da nome, telefono ed email del coach i collegamenti che il cliente usa:
// WhatsApp (whatsappUrl di calendar-events.ts, la stessa del lato coach),
// Chiama ed email. Il dato arriva da get_my_coach (giro del server del
// 02/10/2026: nome, telefono ed email del coach di chi chiama, una riga o
// nessuna), letto da useMyCoach (passata 07); bookCoach ne fa il coach dei
// testi di tutte le pagine del cliente. Nel backup del 26/09 il coach non ha
// il telefono: WhatsApp e Chiama non compaiono, resta l'email.
// ----------------------------------------------------------------------------

import { whatsappUrl } from "@/lib/calendar-events";
import { NO_COACH, type BookCoach } from "@/lib/client-book";

export interface CoachContactInput {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CoachContacts {
  /** La prima parola del nome: «Marco riceve un avviso». */
  firstName: string | null;
  whatsapp: string | null;
  /** «tel:» col numero senza spazi. */
  tel: string | null;
  /** «mailto:» con l'email. */
  mail: string | null;
}

/**
 * WhatsApp e Chiama compaiono insieme: senza un numero valido per whatsappUrl
 * (solo cifre, almeno 6) mancano tutti e due, e resta l'email.
 */
export function getCoachContacts({ name, phone, email }: CoachContactInput): CoachContacts {
  const whatsapp = whatsappUrl(phone);
  const address = email?.trim();
  return {
    firstName: name?.trim().split(/\s+/)[0] || null,
    whatsapp,
    tel: whatsapp && phone ? `tel:${phone.replace(/\s/g, "")}` : null,
    mail: address ? `mailto:${address}` : null,
  };
}

/** Una riga di get_my_coach, TABLE(id, full_name, phone, email): il coach di chi chiama. */
export interface MyCoachRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
}

/**
 * Il coach dei testi (BookCoach) dalla riga di get_my_coach: il nome senza
 * spazi in testa e in coda, il nome di battesimo e il WhatsApp di
 * getCoachContacts, quindi sempre https://wa.me/<cifre> oppure null, mai il
 * telefono così come arriva. Senza riga, o senza nome, è la costante NO_COACH:
 * i testi dicono «il tuo coach» e i pulsanti WhatsApp non ci sono.
 */
export function bookCoach(row: MyCoachRow | null): BookCoach {
  const name = row?.full_name?.trim();
  if (!row || !name) return NO_COACH;
  const contacts = getCoachContacts({ name, phone: row.phone, email: row.email });
  return { name, firstName: contacts.firstName, whatsapp: contacts.whatsapp };
}
