# Passata 07 — Profilo

## Obiettivo
Dati personali, coach, notifiche e account. Nessuna statistica ripetuta dalla Home.

## Punti audit
R1 (interruttore email senza effetto), R2 (testi push da sviluppatore), R3 (modulo password sempre aperto), R4 (collegare Google richiede di uscire), R5 (statistiche ripetute), H6 (contatti del coach), N5, O4, V6.

## Riferimenti design
`designs/Cliente Profilo.dc.html`.

## Schermate
- `screenshots/07-profilo-01-pagina.png`
- `screenshots/07-profilo-02-scorrimento.png`
- `screenshots/07-profilo-03-password.png` — errori sotto i campi.

## File del repo
`src/routes/client.settings.tsx`, `settings-row.tsx`, `src/lib/push.ts`, `src/hooks/use-pwa.ts`, `install-pwa-button.tsx`, `src/lib/auth.tsx`.

## Layout
Intestazione di scheda «Profilo», senza sottotitolo. `main` con padding 4px 16px 32px, colonna con gap 20. Titoli di sezione 14/700 `#41474f` con padding 0 4px; sotto, card a elenco (raggio 24, bordo, `overflow: hidden`) con righe separate da 1px `#f2f3f8`.

### Identità
Riga con gap 14: avatar 64 tondo, fondo `#005685`, iniziali Sora 24/700 bianche (o foto); nome 20/700; email 14 px `#41474f` con ellissi; telefono 14 px `tabular-nums`.

### Il tuo coach (H6)
Card con ombra, padding 16px 18px, gap 14:
- avatar 44 fondo `#cde5ff`, iniziali `#003e62` 15/700; «Il tuo coach» 13/600 `#41474f` e sotto il nome 17/700.
- griglia a tre colonne, gap 8: «WhatsApp» (`MessageCircle`), «Chiama» (`Phone`), «Email» (`Mail`): 48 px, raggio 14, fondo `rgba(0,86,133,0.08)`, testo `#003e62` 14/700, icona 16 con gap 6.

### Il tuo percorso (R5, V6)
Righe di almeno 52 px, padding 10px 16px, etichetta 15 px `#41474f`, valore 15/700 a destra:
- «Percorso» · «Percorso fisso» / «Abbonamento mensile» / «Cliente libero»;
- «Blocco» · «3 di 6»; abbonamento «Blocco in corso» · «4»; concluso «Concluso» · «domenica 6 settembre»;
- «Fine del blocco» · «domenica 11 ottobre»; abbonamento con rinnovo automatico «Rinnovo» · «lunedì 5 ottobre»;
- «Presenza, ultime 8 settimane» · «91%» (`getAttendance`, come in Sessioni);
- se può acquistare: riga pulsante «Booster» (`Sparkles` 18, 15/700 `#003e62`) con `ChevronRight` 18 `#717880` → `/client/store`.

Da togliere: «sessioni fatte / Blocco 3 in corso / prenotate» e «Le tue sessioni residue».

### Notifiche (R1, R2, O4)
- **Notifiche sul telefono** 15/700 e sotto 13 px line-height 1.4 `#41474f`:
  - app installata e attive: «Promemoria, conferme e avvisi quando Marco cambia una sessione.»
  - installata e spente: «Disattivate: gli avvisi restano nella campanella dell'app.»
  - non installata: «Per riceverle installa l'app sulla schermata Home del telefono.»
  - A destra: installata → interruttore 52×32 (acceso `#005685`, spento `#c1c7d0`, pomello bianco 26) con `role="switch"`, toast «Notifiche sul telefono attivate.» / «…disattivate.»; non installata → tonale «Come fare» → foglio di installazione.
- **Inviti del calendario** (`CalendarCheck` 18 `#005685`), 15/700, sotto 13 px: «Ogni sessione arriva come invito di Google Calendar a giulia.b@email.it e si aggiorna da sola se viene spostata o annullata.» Sostituisce l'interruttore «Email di conferma» (R1).

### Account (R3, R4, N5)
- **Accesso con Google** 15/700 con sotto 13 px: non collegato «Entra con il tuo account Google invece della password» e tonale «Collega»; collegato «Collegato: puoi entrare anche con Google» e testuale «Scollega» (`#41474f`). Il collegamento avviene senza uscire (R4). Toast «Account Google collegato.» / «Account Google scollegato: entri con email e password.»
- **Cambia password** (`KeyRound` 18 `#005685`) con `ChevronRight` → foglio.
- **Installa l'app** (`Download` 18) → foglio di installazione; ad app installata la voce diventa «App installata».
- Sotto la card: «Esci», 52 px, raggio 9999, bordo 1px `#c1c7d0`, testo `#b91c1c` 16/700, `LogOut` 18.

### Cambia password (R3) — foglio
- «Nuova password» 14/600 e campo: 52 px, raggio 14, bordo 1px `#c1c7d0` (errore `#b91c1c`), padding 0 14px, 16/500, `autocomplete="new-password"`, `aria-invalid`. Sotto 13/500: «Almeno 8 caratteri.» (`#41474f`); con meno di 8 caratteri, mentre si scrive o dopo il salvataggio, «Servono almeno 8 caratteri (ora 7).» in `#b91c1c`.
- «Ripeti la password» e campo uguale; dopo il salvataggio, se diversa: «Le due password non coincidono.» in `#b91c1c`.
- La regola degli 8 caratteri vale per entrambi i campi (oggi la conferma ne accetta 6).
- Principale «Salva la nuova password» → `supabase.auth.updateUser`; riuscita: chiude e toast «Password aggiornata.»; errore del server sotto il primo campo, non in un toast. Testuale «Indietro».

## Dati e backend
- **R1:** la UI non legge più `profiles.email_notifications` (la colonna può restare).
- **R4:** collegamento con `supabase.auth.linkIdentity({ provider: "google" })` e scollegamento con `unlinkIdentity` (solo se resta un altro modo di entrare). Richiede «Manual linking» attivo in Supabase Auth: verificare e, se serve, fermarsi.
- **H6:** contatti dal `useMyCoach` della passata 00.

## Accettazione
- Nessun numero ripetuto dalla Home; presenza uguale a Sessioni.
- WhatsApp, Chiama ed Email aprono `wa.me`, `tel:` e `mailto:` con i dati del coach.
- Il collegamento a Google non chiude la sessione.
- Errori della password sotto i campi, stessa regola nei due campi.

## Fuori scope
Modifica dei dati personali (oggi non c'è; non aggiungerla).
