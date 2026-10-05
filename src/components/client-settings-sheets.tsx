// ----------------------------------------------------------------------------
// I fogli del Profilo (lato cliente, passata 07, audit R3 e R4)
// ----------------------------------------------------------------------------
// Su ClientSheet, coi pulsanti in colonna a tutta larghezza e un solo pulsante
// pieno per foglio (V4):
//   - PasswordSheet: «Cambia password», due campi con la regola e gli errori
//     sotto di loro e non in un toast (passwordCheck e passwordSaveError di
//     client-settings.ts). Salvare con la regola non rispettata segna il
//     tentativo e non chiama niente; l'errore del server resta sotto il primo
//     campo e il foglio resta aperto; chiudendo il foglio i campi si svuotano,
//     e una risposta del server arrivata dopo la chiusura si ignora. Dopo un
//     «Salva» che non passa il focus va sul primo campo in errore, che ha
//     aria-describedby verso il suo testo: dalla passata 09 dopo che React ha
//     scritto l'errore (flushSync), così lo screen reader lo legge entrando nel
//     campo; se il focus era già lì (Invio dal campo) non si sposta, e
//     l'errore lo dice una regione live. Se il salvataggio rigetta (un errore
//     che non è di Auth) l'errore generico va sotto il primo campo e «Salva»
//     torna attivo;
//   - GoogleLinkSheet: «Collega Google», il giro di oggi spiegato (si esce e
//     si rientra con Google usando la stessa email, decisione 11 del
//     30/09/2026): «Esci e collega Google» chiude il foglio ed esce.
// Ogni label ha htmlFor verso il suo input e contiene solo il testo; i campi
// non portano outline-none: il focus visibile è la regola globale di
// styles.css (README, T2), e in Tailwind 4 outline-none, nel layer utilities,
// la batterebbe.
// ----------------------------------------------------------------------------

import { useRef, useState, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { ClientButton } from "@/components/client-button";
import { ClientSheet } from "@/components/client-sheet";
import { googleLinkText, passwordCheck, passwordSaveError } from "@/lib/client-settings";
import { cn } from "@/lib/utils";

// Il campo del brief: 52 px, raggio 14, bordo #c1c7d0 (#b91c1c in errore), 16/500.
const FIELD = "h-[52px] w-full rounded-[14px] border bg-white px-3.5 text-base font-medium";
const FIELD_OK = "border-outline-variant";
const FIELD_ERROR = "border-danger-text";
const NOTE = "text-[13px] font-medium";

export interface PasswordSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Salva la password nuova (supabase.auth.updateUser, nella pagina): null se
   * è andata, altrimenti il testo dell'errore da mettere sotto il primo campo.
   */
  onSave: (password: string) => Promise<string | null>;
}

export function PasswordSheet({ open, onOpenChange, onSave }: PasswordSheetProps) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  // L'errore detto dalla regione live quando il focus non si sposta: id nuovo
  // a ogni «Salva», così lo stesso testo si annuncia di nuovo.
  const [spoken, setSpoken] = useState<{ id: number; text: string } | null>(null);
  const spokenId = useRef(0);
  const firstRef = useRef<HTMLInputElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);
  // Cambia a ogni chiusura: un salvataggio partito prima non scrive più nel foglio.
  const run = useRef(0);
  const check = passwordCheck(first, second, tried);
  // Sotto il primo campo: l'errore del server, altrimenti la regola (in rosso se non rispettata).
  const firstError = serverError ?? (check.firstInvalid ? check.firstHint : null);

  const reset = () => {
    run.current += 1;
    setFirst("");
    setSecond("");
    setTried(false);
    setSaving(false);
    setServerError(null);
    setSpoken(null);
  };
  const change = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  // Un «Salva» che non passa: prima l'errore nel DOM (aria-invalid e il testo
  // sotto il campo), poi il focus sul campo, che lo screen reader legge con la
  // sua descrizione; se il focus è già lì, la regione live.
  const fail = (field: HTMLInputElement | null, text: string, update: () => void) => {
    const already = field !== null && document.activeElement === field;
    flushSync(() => {
      update();
      setSpoken(already ? { id: (spokenId.current += 1), text } : null);
    });
    if (!already) field?.focus();
  };

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    // La regola col tentativo segnato: senza salvare, il focus va sul primo campo in errore.
    const next = passwordCheck(first, second, true);
    if (!next.canSave) {
      const onFirst = next.firstInvalid;
      fail(
        onFirst ? firstRef.current : secondRef.current,
        onFirst ? next.firstHint : (next.secondError ?? ""),
        () => {
          setTried(true);
          setServerError(null);
        },
      );
      return;
    }
    setTried(true);
    setServerError(null);
    setSpoken(null);
    const mine = run.current;
    setSaving(true);
    let error: string | null;
    try {
      error = await onSave(first);
    } catch {
      // updateUser che rigetta invece di rispondere con un errore: «Salva» non
      // resta spento fino alla chiusura del foglio.
      error = passwordSaveError(null);
    }
    if (mine !== run.current) return;
    if (error) {
      const text = error;
      fail(firstRef.current, text, () => {
        setSaving(false);
        setServerError(text);
      });
    } else {
      setSaving(false);
      change(false);
    }
  };

  return (
    <ClientSheet open={open} onOpenChange={change} title="Cambia password">
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profilo-password-1" className="text-sm font-semibold">
            Nuova password
          </label>
          <input
            ref={firstRef}
            id="profilo-password-1"
            type="password"
            autoComplete="new-password"
            value={first}
            onChange={(e) => {
              setFirst(e.target.value);
              setServerError(null);
            }}
            aria-invalid={firstError ? true : undefined}
            aria-describedby="profilo-password-1-nota"
            className={cn(FIELD, firstError ? FIELD_ERROR : FIELD_OK)}
          />
          <p
            id="profilo-password-1-nota"
            className={cn(NOTE, firstError ? "text-danger-text" : "text-on-surface-variant")}
          >
            {firstError ?? check.firstHint}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="profilo-password-2" className="text-sm font-semibold">
            Ripeti la password
          </label>
          <input
            ref={secondRef}
            id="profilo-password-2"
            type="password"
            autoComplete="new-password"
            value={second}
            onChange={(e) => setSecond(e.target.value)}
            aria-invalid={check.secondInvalid ? true : undefined}
            aria-describedby={check.secondError ? "profilo-password-2-nota" : undefined}
            className={cn(FIELD, check.secondInvalid ? FIELD_ERROR : FIELD_OK)}
          />
          {check.secondError && (
            <p id="profilo-password-2-nota" className={cn(NOTE, "text-danger-text")}>
              {check.secondError}
            </p>
          )}
        </div>
        <ClientButton
          type="submit"
          fullWidth
          aria-disabled={saving || undefined}
          className="aria-disabled:opacity-60"
        >
          Salva la nuova password
        </ClientButton>
        {spoken && (
          <p key={spoken.id} role="alert" className="sr-only">
            {spoken.text}
          </p>
        )}
        <ClientButton type="button" variant="text" fullWidth onClick={() => change(false)}>
          Indietro
        </ClientButton>
      </form>
    </ClientSheet>
  );
}

export interface GoogleLinkSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** L'email del profilo, altrimenti quella dell'accesso (profileIdentity); null senza. */
  email: string | null;
  /** «Esci e collega Google»: il toast, l'uscita e la pagina di accesso (nella pagina). */
  onConfirm: () => void;
}

export function GoogleLinkSheet({ open, onOpenChange, email, onConfirm }: GoogleLinkSheetProps) {
  return (
    <ClientSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Collega Google"
      description={googleLinkText(email)}
    >
      <ClientButton fullWidth onClick={onConfirm}>
        Esci e collega Google
      </ClientButton>
      <ClientButton variant="text" fullWidth onClick={() => onOpenChange(false)}>
        Indietro
      </ClientButton>
    </ClientSheet>
  );
}
