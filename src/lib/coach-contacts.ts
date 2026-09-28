// ----------------------------------------------------------------------------
// Contatti del coach (lato cliente, passata 00, audit H6)
// ----------------------------------------------------------------------------
// Da nome, telefono ed email del coach i collegamenti che il cliente usa:
// WhatsApp (whatsappUrl di calendar-events.ts, la stessa del lato coach),
// Chiama ed email. Oggi il cliente questi dati non li legge: nessuna policy di
// profiles gli dà la riga del suo coach, e get_coach_for restituisce solo
// l'id. Serve una funzione sul server (get_my_coach), rinviata al 02/10/2026;
// e nel backup del 26/09 il coach non ha nemmeno il telefono. L'helper è
// pronto per quando il dato arriva.
// ----------------------------------------------------------------------------

import { whatsappUrl } from "@/lib/calendar-events";

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
