# Handoff: redesign lato Cliente (mobile) — NC Calendar

## Overview
Redesign di ciò che il cliente vede e usa sul telefono: sette schermate (Home, Prenota, Sessioni, Dettaglio sessione, Booster, Profilo, Notifiche), la barra in basso, le intestazioni e i fogli dal basso (Sposta, Annulla, riepilogo della prenotazione, riepilogo d'acquisto, password, installazione). Nasce da un audit UX/UI del codice attuale: 42 problemi (4 alta, 20 media, 18 bassa), quattro decisioni di prodotto (O1–O4) e una seconda verifica (V1–V15). Ogni correzione è marcata nel prototipo con il codice del punto di audit (es. `H1`, `B3`, `D1`).

Il lavoro è diviso in **10 passate** ordinate per dipendenza. L'ordine, i messaggi da mandare a Claude Code e i punti in cui fermarsi sono in **`PIANO.md`**. Ogni passata ha un brief autonomo in `passes/`.

## About the Design Files
I file in `designs/` sono **riferimenti di design creati in HTML**: prototipi che mostrano aspetto e comportamento voluti, **non codice da copiare in produzione**. Il compito è **ricreare questi design nel codebase esistente** (`nc-calendar`: React + TanStack Router + TanStack Query + Supabase + Tailwind v4 + componenti shadcn in `src/components/ui`), usando i pattern, gli hook dati e le librerie già presenti.

- I prototipi usano un archivio dati finto (`designs/nc-store.js` + `designs/nc-client.js`, in localStorage) al posto di Supabase. In app si usano le query e le RPC esistenti (`src/lib/queries.ts`, `src/lib/query-keys.ts`, `supabase/migrations`). `nc-client.js` è comunque utile come specifica: contiene le regole (`RULES`), il conteggio dei crediti (`pools`), gli stati (`status`), il generatore di orari (`slotDays`) e i testi delle notifiche.
- Gli stili nei prototipi sono inline per ragioni di strumento: in app vanno espressi con classi Tailwind e token di `src/styles.css`.
- I prototipi sono disegnati dentro una cornice iPhone 402×874. Le misure verticali di intestazioni, barra in basso e fogli nel prototipo **includono** barra di stato e indicatore Home: in app si usano `env(safe-area-inset-top)` e `env(safe-area-inset-bottom)` (valori nei brief).

### Ambito
- **Lato cliente, telefono (320–480 px di larghezza).** È la vista principale e quella del prototipo.
- **Desktop e tablet (≥ md):** nessun layout dedicato. Le stesse pagine stanno in una colonna centrata larga al massimo 560 px, sotto l'header desktop di `client.tsx`; la barra in basso resta nascosta e le cinque schede (con la campanella) stanno nell'header.
- **Lato coach:** non cambia, salvo tre punti esplicitati nei brief: la card «Regole di prenotazione» della Disponibilità legge i nuovi valori (passata 00), le notifiche del coach per gli acquisti (06), i trigger che avvisano il cliente delle azioni del coach (08).

### Come aprire il prototipo
Servire `designs/` con un web server locale (es. `npx serve designs`) e aprire `Cliente Home.dc.html`. La navigazione funziona dalla barra in basso. A destra del telefono c'è il pannello «Note di revisione»:
- i codici dell'audit applicati nella schermata aperta (il codice apre il punto nell'audit);
- **Cliente di prova**: quattro situazioni diverse (vedi sotto);
- **Ora simulata**: 08:15, 10:40, 13:10, 19:10 o ora reale;
- **Ripristina i dati di esempio**.

Il pannello si nasconde con la prop `reviewPanel`. L'audit completo è in `designs/Audit Cliente Mobile.dc.html`. I collegamenti al prototipo del coach («Apri il calendario del coach», «Audit lato coach») funzionano se si copiano nella stessa cartella i file di `design_handoff_coach_redesign/designs/`: i due prototipi condividono i dati, quindi prenotazioni, spostamenti, annullamenti e acquisti del cliente compaiono nel calendario del coach e le azioni del coach nelle notifiche del cliente.

Clienti di prova:
- **Giulia Bianchi** — percorso fisso, blocco 3 di 6 in corso. È il caso principale.
- **Marta Conti** — abbonamento mensile, blocco che finisce il 4 ottobre, sessione oggi alle 19:30 (meno di 24 ore).
- **Elena Ricci** — cliente libera: crediti senza scadenza, non può acquistare Booster.
- **Davide Ferrari** — percorso concluso.

## Schermate
`screenshots/` contiene 32 immagini con prefisso uguale al numero della passata (es. `04-sessione-02-sposta.png` → passata 04). Ogni brief elenca le sue.
- Telefono 402×874 a grandezza reale (immagini 434×906 con il margine).
- Dati di esempio di lunedì 28/09/2026, ora simulata 10:40.
- Alcune immagini mostrano uno stato preparato apposta: la sessione di Giulia di mercoledì non ancora confermata (per mostrare «Conferma presenza»), la sessione di Giulia delle 9:00 segnata come svolta (per mostrare la valutazione), tre azioni del coach nelle notifiche.
- Il pannello di revisione è nascosto. Le immagini «scorrimento» mostrano la stessa pagina più in basso.
- In caso di dubbio valgono i valori dei brief e del prototipo, non i pixel.

## Fidelity
**High-fidelity.** Colori, tipografia, spaziature, testi e interazioni sono definitivi. Ricreare l'interfaccia fedelmente usando i componenti del codebase (Drawer/Sheet, Dialog, AlertDialog, Switch di shadcn; `sonner` per i toast; `lucide-react` per le icone). Dove il prototipo e questi documenti divergono valgono i documenti; dove i documenti tacciono vale il prototipo (i valori esatti sono negli attributi `style` dei file `.dc.html`).

## Schermate, route e passate

| Schermata | Prototipo | Route | Passata |
|---|---|---|---|
| Barra, intestazioni, fogli, toast | `Cliente Tab Bar.dc.html` + tutte | `client.tsx` | 01 |
| Prenota | `Cliente Prenota.dc.html` | `/client/book` | 02 |
| Sessioni | `Cliente Sessioni.dc.html` | `/client/sessions` (nuova) | 03 |
| Dettaglio sessione, Sposta, Annulla | `Cliente Sessione.dc.html`, `Cliente Sposta.dc.html` | `/client/bookings/$bookingId` | 04 |
| Home | `Cliente Home.dc.html` | `/client` | 05 |
| Booster | `Cliente Booster.dc.html` | `/client/store` | 06 |
| Profilo | `Cliente Profilo.dc.html` | `/client/settings` | 07 |
| Notifiche | `Cliente Notifiche.dc.html` | `/client/notifications` (nuova) | 01 + 08 |

Le route esistenti restano con gli stessi percorsi (link nelle notifiche push, URL di ritorno di Stripe); cambiano solo le etichette.

## Regole trasversali (valgono in tutte le passate)
- **Lingua e glossario (T1, T4):** italiano, solo iniziale maiuscola («Prenota una sessione», non «Prenota Nuova Sessione»). Glossario condiviso con il lato coach:
  - *sessione* (non «appuntamento»); *credito / crediti* («3 disponibili», «1 disponibile»); *Booster* (non «NC Add-on», «Store», «pacchetto»); *Prenota* (non «Calendario», «Nuova prenotazione»); *Sposta* (non «Riprogramma»); *Annulla sessione* (non «Cancella»); *Profilo* (non «Impostazioni»); *clienti* (mai «atleti»); *NC Calendar* (non «NC Training Systems»).
  - Stati della sessione: Prenotata, Da confermare, Confermata, In corso, In verifica, Svolta, Assente, Annullata, Annullata tardi (non «No Show», «In programma», «Programmata», «rimborsato»).
  - Titolo della scheda del browser: «<Pagina> · NC Calendar».
- **Date e ore:** «Mercoledì 30 settembre» (giorno con iniziale maiuscola, mese minuscolo), «mer 30 set», «10:00–11:00» con trattino lungo, «Oggi», «Domani». Tempo che manca (H5): «tra 25 min» solo nell'ultima ora, poi «tra 3 ore», «domani», «tra 2 giorni»; nessun conto alla rovescia al secondo. Helper esistenti in `src/lib/session-time.ts` (`formatLongDay`, `formatShortDay`, `formatTimeRange`) più i nuovi della passata 00.
- **Una regola per prenotare e spostare (O1):** da 24 ore a 14 giorni prima, e non oltre la validità dei crediti. Spostare e annullare sono gratuiti fino a 24 ore prima. Numeri in un solo file (`src/lib/booking-rules.ts`), letti anche dalla Disponibilità del coach.
- **Conferma della presenza (O3):** si chiede da 48 ore prima, solo per le sessioni prenotate con più anticipo o inserite dal coach; chi prenota o sposta entro le 48 ore risulta già confermato.
- **Nessun «Aggiungi a Google Calendar» (O4, D2):** l'invito arriva con la prenotazione e si aggiorna da solo. Si indica l'indirizzo a cui è arrivato.
- **Contatti del coach (H6):** ogni messaggio che rimanda al coach ha il collegamento WhatsApp (`https://wa.me/<cifre>`); nel Profilo anche telefono ed email.
- **Toast (V1):** le azioni che si possono annullare hanno l'azione **«Ripristina»** (8 s, `toastWithUndo` in `src/lib/toast.ts`); gli altri toast durano ~3 s. Mai «Annulla» come azione di un toast.
- **Conferme:** foglio dal basso o `AlertDialog`, mai `confirm()` del browser.
- **Una sola azione piena per stato (V4, V11):** in ogni card o foglio al massimo un pulsante principale pieno.
- **Stato nell'URL:** `tab` in Sessioni, `eventType` in Prenota, `type` e `booster` in Booster, `from` per tornare indietro (D5).
- **Accessibilità (T2):** testo minimo 12 px, aree di tocco di almeno 44 px, contrasto ≥ 4.5:1. Controlli segmentati e gruppi di scelta con `role="radiogroup"`/`role="radio"` o `tablist`/`tab`, navigabili con frecce, Home, End (come nel lato coach). Pulsanti solo icona con `aria-label`; scheda attiva con `aria-current="page"`; focus visibile `outline: 2px solid #005685; outline-offset: 2px`.
- **Icone:** Lucide, nessuna emoji (T3).

## Design Tokens
Token esistenti in `src/styles.css` (usare questi nomi):

| Uso | Token | Valore |
|---|---|---|
| Testi forti, badge, etichette selezionate | `--color-aura-primary` | `#003e62` |
| Pulsanti principali, selezione, icone informative (V7) | `--color-primary-container` | `#005685` |
| Testo | `--color-on-surface` | `#191c1f` |
| Testo secondario | `--color-on-surface-variant` | `#41474f` |
| Testo terziario, icone freccia | `--color-outline` | `#717880` |
| Bordi dei pulsanti secondari, anelli radio, maniglia dei fogli | `--color-outline-variant` | `#c1c7d0` |
| Bordi delle opzioni, pulsante disabilitato | `--color-surface-variant` | `#e1e2e7` |
| Fondo segmentati, chip neutri, barre vuote | `--color-surface-container` | `#eceef2` |
| Giorni non disponibili, separatori interni | `--color-surface-container-low` | `#f2f3f8` |
| Fondo pagina e riquadri nei fogli | `--color-surface` | `#f8f9fe` |
| Orari consigliati, avatar del coach | `--color-primary-fixed` | `#cde5ff` |
| Barra «prenotate», bordo orari consigliati | `--color-primary-fixed-dim` | `#94ccff` |
| «Ripristina» e icona info nel toast | `--color-on-primary-container` | `#91cbff` |
| Badge della campanella | `--color-error-bright` | `#e53935` |
| Stati positivi | `--color-success-text` / `--color-success-soft` | `#047857` / `#ecfdf5` |
| Avvisi, «Da confermare», badge Sessioni | `--color-warning-text` / `--color-warning-soft` | `#c2410c` / `#fff7ed` |
| Errori, azioni distruttive, «Assente» | `--color-danger-text` / `--color-danger-soft` | `#b91c1c` / `#fef2f2` |
| Ombra delle card | `--shadow-soft-card` | `0 8px 30px rgba(0,0,0,0.04)` |

**Token nuovi** (passata 00):

| Token | Valore | Uso |
|---|---|---|
| `--color-warning-ink` | `#9a3412` | testo dentro i riquadri `warning-soft`, «Crediti esauriti» in Prenota |
| `--color-credit-lost` | `#f59e0b` | barra «perse» nella card crediti |
| `--color-rating-soft` / `--color-rating-text` | `#fef3c7` / `#92400e` | chip «Da valutare» |
| `--color-rating-star` / `--color-rating-star-line` | `#d97706` / `#b45309` | stelle piene |
| `--color-toast` | `#191c1f` | fondo dei toast |
| `--color-toast-ok` / `--color-toast-warn` | `#6ee7b7` / `#fdba74` | icone dei toast |
| `--color-scrim` | `rgba(0,20,35,0.42)` | fondo dietro i fogli |

Trasparenze ricorrenti del primario `#005685`: 12% scheda attiva della barra; 10% pulsanti tonali e riquadri icona; 8% chip «Prenotata» e pulsanti di contatto del coach; 7% riquadro informativo del Booster; 6% opzione selezionata. Bordi: card `rgba(193,199,208,0.35)`, pulsanti dell'intestazione `rgba(193,199,208,0.6)`, barra in basso `rgba(193,199,208,0.45)`. Colori delle tipologie: `event_types.color`; i riquadri icona usano lo stesso colore al 10% (`#rrggbb1a`).

**Tipografia:** Sora (titoli) e Manrope (tutto il resto), già caricati.
- Sora: 28/700 titolo delle schede (lh 1.15, letter-spacing −0.02em); 24/700 titolo del dettaglio sessione; 22/700 titolo dei fogli e giorno della prossima sessione; 20/700 numero del giorno; 24–30/700 prezzi e valore BIA; cifre `tabular-nums`.
- Manrope: 12 (chip 700, etichette della barra 600/700, meta), 13 (testi secondari, regole), 14 (corpo piccolo; etichette di sezione 700), 15 (corpo; nomi nelle righe 700), 16 (pulsanti principali 700, orari), 17/700 (titoli delle card, V3; titolo delle pagine aperte).

**Raggi (V5):** card 24 px; righe e opzioni 18; orari e campi 14; riquadri icona 12 (40 px), 14 (44–48 px), 16 (52 px); fogli 28 in alto; toast 16; pulsanti e chip 9999.

**Altezze (V4):** pulsante principale 52 (16/700); secondario 48 (15/600–700); testuale e azioni nelle righe 44 (14–15/700); pulsanti dell'intestazione 44; scheda della barra 58; segmentati 44 (dentro 4 px di padding); giorno 60×80; orario 48; opzione tipologia minimo 64; riga sessione e riga notifica minimo 72; righe del Profilo minimo 52.

**Spaziature:** padding orizzontale del contenuto 16 (intestazioni 20); gap tra card 16 (Home, Booster, Dettaglio) o 20 (Prenota, Sessioni, Profilo); padding delle card 18 (Home), 20 (card di messaggio), 16 (sezioni del dettaglio).

## Dati e backend — riepilogo
Voci che richiedono lavoro lato Supabase (dettagli e testo dei messaggi nei brief). In ogni caso: proporre la migrazione, aspettare conferma, rigenerare i tipi, poi la UI.
- **O1 (00)** regola lato server: oggi `enforce_client_booking_rules` controlla solo che la tipologia sia prenotabile e `reschedule_booking` non limita la nuova data; `booking-rules.ts` ha preavviso 0 e orizzonte 90 giorni.
- **O3 (00)** conferma automatica entro 48 ore: oggi `client_confirmed_at` si imposta solo con `confirm_booking_attendance` e il trigger `trg_bookings_reset_confirmation` lo azzera a ogni spostamento.
- **H9 (00)** nota facoltativa della valutazione: `session_feedback` ha solo `rating`.
- **H6 (00)** telefono ed email del coach leggibili dal cliente (RLS di `profiles` o RPC).
- **D1 (04)** «Ripristina» dopo l'annullamento: oggi non esiste un modo di riportare una sessione a `scheduled`.
- **S1, S2, S3 (06)** validità dei Booster (oggi `booster-checkout` scrive una scadenza che `validate_booking_extra_credits` ignora), prodotti letti da `booster_packs`, URL di ritorno di Stripe sulla pagina Booster.
- **R4 (07)** collegamento di Google senza uscire (`linkIdentity`, da abilitare in Supabase Auth).
- **H8 (08)** notifiche al cliente per le azioni del coach: nuovi tipi nella tabella `notifications` e trigger che le scrivono.

## Assets
Nessuna immagine. Icone: Lucide (`lucide-react`, già usato); i nomi usati nel prototipo coincidono con i componenti Lucide (`Home`, `CalendarPlus`, `CalendarDays`, `Sparkles`, `User`, `Bell`, `ChevronLeft`, `ChevronRight`, `CircleCheck`, `Repeat`, `MessageCircle`, `Phone`, `Mail`, `MapPin`, `Video`, `Info`, `Coins`, `Hourglass`, `Clock`, `CalendarCheck`, `CalendarX`, `CalendarRange`, `UserX`, `Timer`, `TrendingUp`, `Download`, `Upload`, `KeyRound`, `LogOut`, `Lock`, `Award`, `Layers`, `Rocket`, `Activity`, `BellOff`, `TriangleAlert`). Le icone delle tipologie vengono da `src/lib/session-type-icon.ts`. La stella della valutazione è un path SVG (nel prototipo), non un'icona Lucide.

## Files
- `PIANO.md` — ordine delle passate, stato, messaggi per Claude Code, punti in cui fermarsi.
- `passes/00-fondamenta.md` … `passes/09-verifica-finale.md` — un brief per passata.
- `screenshots/` — 32 schermate di riferimento, per passata.
- `designs/Audit Cliente Mobile.dc.html` — audit completo (42 punti, decisioni O1–O4, seconda verifica V1–V15, ricostruzione delle schermate attuali).
- `designs/Cliente *.dc.html` — prototipo: sette pagine, `Cliente Tab Bar`, `Cliente Sposta` (foglio condiviso da Home e Dettaglio), `Cliente Revisione` (pannello di revisione, solo prototipo).
- `designs/nc-client.js` — logica lato cliente del prototipo (regole, crediti, stati, orari, notifiche): utile come specifica.
- `designs/nc-store.js` — archivio condiviso con il prototipo del coach.
- `designs/nc-icons.js`, `designs/nc-ios-frame.js`, `designs/support.js` — runtime del prototipo, non servono in app.
