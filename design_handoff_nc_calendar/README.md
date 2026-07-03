# Handoff: NC Calendar — App di prenotazione Studio PT (lato Cliente + lato Coach)

## Overview
NC Calendar è un'app di prenotazione per uno studio di personal training. Ha **due esperienze** che condividono gli stessi dati:

- **App Cliente** (mobile, 430×932): l'atleta vede il proprio blocco di allenamento, prenota/riprogramma/cancella sessioni, conferma la presenza, consulta i progressi (BIA), acquista "booster" e gestisce il profilo.
- **App Coach / Studio** (desktop, 1440×900): il trainer gestisce calendario, clienti, profili, tipologie di evento, disponibilità e integrazioni; vede in tempo reale le prenotazioni fatte dai clienti.

Concetti di dominio chiave:
- **Blocco (block)**: un ciclo di allenamento composto da N sessioni (qui `size = 8`). Il percorso ha più blocchi (qui `total = 6`).
- **Pool / crediti**: sessioni disponibili per tipologia in un blocco (es. PT 5, BIA 2, Test 1). I "booster" acquistati nello Store aggiungono crediti extra.
- **Tipologie**: `PT` (Sessione PT, 60 min), `BIA` (30 min), `TEST`/`Test Funzionale` (45 min), più `CONS`/Consulenza lato coach.

## About the Design Files
I file in `designs/` sono **riferimenti di design realizzati in HTML** — prototipi che mostrano aspetto e comportamento voluti, **non codice di produzione da copiare così com'è**. Sono scritti come "Design Components" (`.dc.html`) che dipendono da un runtime interno (`support.js`): **non riutilizzare `support.js`**, è solo l'impalcatura del prototipo.

Il compito è **ricreare questi design nell'ambiente del codebase di destinazione** (React, Vue, SwiftUI, Flutter, ecc.) usando i suoi pattern e librerie. Se non esiste ancora un ambiente, scegliere il framework più adatto (consigliato: React + TypeScript per il web, con una libreria di routing e uno state store). La **logica di dominio e il modello dati** nei file `client-store.js` e `coach-clients.js` sono invece direttamente riutilizzabili/portabili: contengono la fonte di verità e vanno reimplementati come servizi/store nel target.

## Fidelity
**High-fidelity (hifi).** Colori, tipografia, spaziature, raggi, ombre e interazioni sono definitivi. Ricreare la UI in modo fedele. Tutti gli stili nei prototipi sono inline (scelta del runtime di prototipazione): nel codebase reale vanno tradotti nel sistema di stili esistente (design tokens, componenti, CSS/utility).

---

## Design Tokens

### Colori
| Ruolo | Hex |
|---|---|
| Primario (brand deep blue) | `#003e62` |
| Primario alt / azioni | `#005685` |
| Accento chiaro (su primario) | `#91cbff` |
| Accento azzurro (BIA / info) | `#039BE5` |
| Azzurro tenue (prenotato) | `#94ccff` |
| Blu "riprogramma"/secondario | `#3b5bde` / `#4361ee` |
| Verde (successo/presente) | `#0b8043` / `#059669` |
| Arancio (in scadenza/attenzione) | `#ea580c` |
| Rosso (errore/cancella/no-show) | `#dc2626` / `#e53935` |
| Viola (consulenza) | `#8E24AA` |
| Testo primario | `#191c1f` |
| Testo secondario | `#41474f` |
| Testo terziario / muted | `#717880` |
| Bordo | `#c1c7d0` / `#e1e2e7` |
| Sfondo app | `#f8f9fe` |
| Sfondo pagina/desk | `#eceef2` |
| Superfici tenui | `#f2f3f8` / `#eceef2` |
| Bianco superfici | `#ffffff` |

Colori per tipologia evento (calendario/badge): PT `#003e62`, BIA `#039BE5`, TEST `#0b8043`, CONS `#8E24AA`.
Semaforo presenza: ≥80% verde `#059669`, ≥60% arancio `#ea580c`, <60% rosso `#dc2626`.

### Tipografia
- **Display/heading**: `Sora` (700/600), `letter-spacing: -0.02em`. Usata per titoli, numeri grandi, valori "hero".
- **Testo/UI**: `Manrope` (400/500/600/700/800).
- **Numeri tabellari**: `font-variant-numeric: tabular-nums` (classe `.tnum`) per orari, contatori, metriche.
- Scale ricorrenti: hero title desktop 48px/700; H1 mobile 24px/700; titolo sezione 20px/600; card title 16px/700; corpo 14px; label/meta 12–13px; micro-badge 10–11px.
- Mobile: mai sotto ~12px per il testo; hit target ≥44px.

### Spaziatura, raggi, ombre
- Raggi: pill/full `9999px`; card grandi `32px` (mobile) / `24–28px` (desktop); input/campi `10–16px`; icone-quadrate `10–16px`.
- Ombre: card soft `0 8px 30px rgba(0,0,0,0.04)`; desktop card `0 4px 20px rgba(0,86,133,0.05)`; popover/menu `0 12–20px 40–60px rgba(0,0,0,0.18–0.22)`.
- Spaziature tipiche: padding card 20–32px; gap sezioni 24–32px; gap elementi 8–16px.
- **Focus visibile** (a11y): `outline: 2px solid #005685; outline-offset: 2px` su `:focus-visible`.
- **Transizione di pagina**: fade+slide `@keyframes { opacity 0→1; translateY(6px→0) }`, `0.28s ease`, **solo con `prefers-reduced-motion: no-preference`**.

---

## Screens / Views

### App Cliente (mobile 430×932, bottom nav a 4 voci: Home · Prenota · Store · Profilo)

**1. Client Dashboard** (`Client Dashboard.dc.html`) — Home
- Header sticky: avatar iniziale, "Ciao {nome}", campanella notifiche (badge non-lette).
- **Banner promemoria** (se sessione entro 48h e non confermata): "Promemoria: {giorno} alle {ora}", CTA "Conferma".
- **Card stato** (condizionale): "Blocco N completato → Rinnova" (verde) oppure "Benvenuta! Prenota la prima sessione" (welcome, primo accesso).
- **Card blocco corrente**: label "BLOCCO n DI total"; barra a segmenti (completate = piene `#003e62` con check; prenotate = `#94ccff` con data; da prenotare = tratteggiate `#c1c7d0`); legenda; card "Le tue Sessioni" con righe per pool (icona, "used/total", pulsante Prenota o "Completo"); riga statistiche (fatte / prenotate / da fare).
- **Card "I tuoi progressi"**: toggle Peso/Massa/Grasso, sparkline SVG, delta vs prima misurazione. Dati = misurazioni BIA (sync dal coach).
- **Card "Il tuo percorso"**: elenco blocchi (passati pieni, attuale con barra %, futuri tratteggiati) + riepilogo percentuale.
- **Card "Prossima Sessione"**: giorno relativo (Oggi/Domani/…), fascia oraria, countdown live, tipo; chip "Conferma presenza" / "Presenza confermata", "Dettagli", "Riprogramma". Se nessuna: empty state con "Prenota ora".
- **Timeline "Percorso recente"**: ultime sessioni passate con stato (Completata/Cancellata).
- CTA "Prenota Nuova Sessione".
- **Pannello notifiche** (dal bell): lista derivata (conferma presenza, sessioni da prenotare entro scadenza, nuova BIA, pool esaurito, feedback in sospeso); badge; "Segna lette"; voci cliccabili → azione.

**2. Client Booking** (`Client Booking.dc.html`) — Prenota
- App bar con back + titolo ("Nuova Prenotazione" o "Riprogramma"). Selettore tipologia (chip con crediti residui). Calendario mensile (navigazione mesi; giorni prenotabili vs disabilitati; domenica chiusa; orizzonte prenotabile). Griglia orari disponibili (slot, uno "Consigliato" evidenziato). Barra inferiore con riepilogo selezione + "Conferma". Alla conferma: crea/riprogramma la sessione e naviga al Dettaglio.
- Parametri via hash: `#t=PT` (tipo preselezionato), `#rid=<id>&t=<tipo>` (modalità riprogramma).

**3. Client Booking Detail** (`Client Booking Detail.dc.html`)
- Carica la sessione reale via hash (`#<id>`), opzionale `&resched=1`. Hero con badge stato (Programmata/Da riprogrammare/Cancellata/Completata), tipo, data/ora, luogo. Durata. Descrizione. Note del coach. Azioni: "Conferma presenza" (se upcoming), "Aggiungi a Google Calendar", "Riprogramma" (→ Booking in resched), "Cancella"/"Ripristina" (con refund del credito).

**4. Client Store** (`Client Store.dc.html`)
- Header + **bilancio crediti booster**. Card prodotti (Sessione PT singola +1, Pacchetto PT +3, Test +1) con "Acquista" → accredita i pool (`addCredits`), toast e stato "Aggiunto ✓". Nota scadenza crediti.

**5. Client Profile** (`Client Profile.dc.html`)
- Identità (avatar, nome, email, badge "Percorso attivo · scade …"). Statistiche (sessioni fatte / blocco / prenotate). "Sessioni residue" per pool con barre. Menu (Acquista Booster → Store, Notifiche, Pagamento, Assistenza). **Selettore "Scenari demo"** (Normale / Blocco finito / Nuovo cliente) per la revisione. "Ripristina dati dimostrativi".

### App Coach / Studio (desktop 1440×900, sidebar sinistra 256px con: Panoramica, Calendario, Clienti, Tipologie evento, Disponibilità, Integrazioni)

**6. Trainer Dashboard** (`Trainer Dashboard.dc.html`) — Panoramica
- Header con campanella **"Attività clienti"** (notifiche dal canale condiviso: "{cliente} ha prenotato/confermato", valutazioni ricevute). Saluto + conteggio sessioni di oggi. Lista "Oggi" con check-in per riga (aggiorna contatore; al check-in un campo nota registra la sessione nel profilo del cliente). Grafici distribuzione (barre animate).

**7. Trainer Calendar** (`Trainer Calendar.dc.html`) — Calendario
- Settimana a 7 colonne × ore. Navigazione settimana (prec/succ/Oggi). Filtri per tipologia (chip). Sync. Eventi generati + **overlay in tempo reale delle prenotazioni dei clienti** (badge "cliente", ✓ se confermata; sola lettura via popover). Drag-to-reschedule degli eventi dello studio; click su colonna per creare; popover dettaglio con nota, ±1h, elimina; slot "Assegna" il venerdì.

**8. Trainer Clients** (`Trainer Clients.dc.html`) — Clienti
- Barra riepilogo (totali/attivi/in scadenza). Toolbar: ricerca, **toggle griglia/tabella**, ordinamento (Nome/Scadenza/Attività/Presenza). Tab (Tutti/Attivi/In Scadenza/Archiviati con conteggi). Card cliente: accento colore per stato, pacchetto PT con barra, prossima sessione (live per il cliente-app, con ✓ se confermata), % presenza; menu ⋮ (Apri profilo, Rinnova/Ripristina, Messaggio, Archivia/Elimina). **Vista tabella** con stesse colonne, ordinabile e navigabile da tastiera. Archiviazione **persistente** e sincronizzata.

**9. Trainer Client Detail** (`Trainer Client Detail.dc.html`) — Profilo cliente
- Switcher cliente (prev/next/select via hash `#<slug>`). Header (anagrafica, stato, piano). Pacchetto/crediti. Storico sessioni (correzione presenza; note per sessione editabili). **Andamento BIA**: grafico Peso/Massa/Grasso; **aggiungi** misurazione (anche con data passata, inserita in ordine cronologico); **modifica/elimina** una misurazione (clic sull'etichetta mese; resta sempre ≥1). Note & obiettivi (nota privata coach con autosave). Persistenza per-cliente.

**10. Trainer Availability** (`Trainer Availability.dc.html`) — Disponibilità
- Orari settimanali (toggle giorno, fasce orarie add/remove, orari ciclabili). Regole di prenotazione (preavviso, anticipo, durata) a step. Eccezioni (aggiungi/rimuovi date chiuse). **Anteprima settimana**: stima slot prenotabili, ricalcolata live al variare di orari/giorni/buffer. Salva (toast).

**11. Trainer Event Types** (`Trainer Event Types.dc.html`) — Tipologie evento
- Griglia di card servizio: nome editabile, colore ciclabile, durata/buffer/prezzo con stepper, toggle attivo, contatore prenotazioni. "Nuova tipologia".

**12. Trainer Integrations** (`Trainer Integrations.dc.html`) — Integrazioni
- Elenco integrazioni (Google Calendar, Zoom, Stripe, Apple Calendar, WhatsApp, Mailchimp) con connetti/disconnetti e contatore attive.

---

## State Management & Data Model

La fonte di verità è in due moduli portabili (da reimplementare come store/servizi nel target). Nel prototipo usano `localStorage`; **in produzione sostituire con API/DB**. Chiavi usate:
- `ncapp-giulia-v1` — stato app cliente (vedi sotto).
- `ncbookings-v1` — **canale condiviso** prenotazioni cliente↔coach.
- `ncclient-<slug>` — dati per-cliente lato coach (BIA, sessioni, note).
- `nccoach-archived` — elenco slug clienti archiviati.
- `ncnotif-read-giulia`, `nccoachnotif-read` — stato "letto" notifiche.

### `client-store.js` (app cliente — `window.NCClient`)
Stato cliente:
```
{
  name, initial,
  block: { n, total, size, deadline },
  pools: { PT:{total}, BIA:{total}, TEST:{total} },
  credits: { PT, BIA, TEST },          // booster acquistati
  sessions: [ { id, type, date(YYYY-MM-DD), time(HH:MM), block,
                status:'upcoming'|'done'|'cancelled', confirmed:bool,
                feedback:1..5|null, coach, location, note } ],
  bia: [ { m(label mese), date(YYYY-MM), weight, muscle, fat } ]
}
```
API principali: `load/save`, `poolFor(type)` (used/total/left per **blocco corrente**), `upcoming/past/next/byId`, `blockStats()` (done/booked/open/complete/lastBlock/empty), `book/reschedule/cancel/restore`, `confirmAttendance`, `setFeedback/pendingFeedback`, `addCredits`, `reminderDue(h)`, `renewBlock()`, `scenario('normal'|'endblock'|'empty')`, `notifications()/unreadCount()/markAllRead()`, `syncBookings()` (pubblica le upcoming sul canale condiviso), `go(page,hash)/wireNav()`, formatter date IT.

### `coach-clients.js` (roster coach — `window.COACHData`)
Roster canonico condiviso da **Clienti** e **Profilo**:
```
clients: [ { name, email, phone, plan, status:'Attivo'|'In Scadenza'|'Completato',
             block:[fatti,totali], credits:{PT:[u,t],BIA:[u,t],Test:[u,t]},
             expiry, expDays, goal, limit, next, last, lastDays, att, slug, initials } ]
```
API: `withLive()` (sovrappone la prossima sessione **reale** di Giulia dal canale `ncbookings-v1`), `getArchived/isArchived/setArchived`, `slug()`.

### Sincronizzazione (comportamento da preservare)
- **Loop di prenotazione**: `book/reschedule/cancel` aggiornano pool, blocco, prossima sessione, timeline e **pubblicano su `ncbookings-v1`** → il **calendario coach** e la **pagina Clienti** riflettono la prenotazione (con stato conferma).
- **Ciclo di vita**: promemoria → conferma presenza (visibile anche al coach) → feedback post-sessione.
- **BIA** scritta dal coach (`ncclient-<slug>`) → mostrata al cliente ("I tuoi progressi").
- **Cross-tab live**: le pagine ascoltano l'evento `storage` e si aggiornano quando un'altra scheda modifica i dati. In produzione questo diventa realtime via websocket/subscription.

> Nota: il prototipo è mono-dispositivo (browser). Per multi-utente/multi-dispositivo serve un **backend** (auth, DB, API, realtime). Il modello dati sopra è già la base dello schema.

## Interactions & Behavior (riepilogo)
- Navigazione: bottom nav (cliente) e sidebar (coach) collegano tutte le schermate; `aria-current` sulla voce attiva.
- Countdown live sulla prossima sessione; barre/heatmap animate all'ingresso.
- Toast per conferme azione; popover per dettagli calendario e menu ⋮.
- Drag-to-reschedule (coach calendar) con snap a colonna/ora.
- Empty/limit/complete states su Dashboard cliente.
- A11y: `:focus-visible`, `aria-label` su pulsanti-icona, righe tabella `role=button` attivabili da tastiera, rispetto di `prefers-reduced-motion`.

## Assets
Nessun asset binario. Tutte le icone sono **SVG inline in stile Lucide** (stroke `currentColor`, width 2). I font sono **Google Fonts**: `Sora` e `Manrope`. Sostituire con il set icone/librearia del codebase se disponibile.

## Files (in `designs/`)
- App cliente: `Client Dashboard.dc.html`, `Client Booking.dc.html`, `Client Booking Detail.dc.html`, `Client Store.dc.html`, `Client Profile.dc.html`
- App coach: `Trainer Dashboard.dc.html`, `Trainer Calendar.dc.html`, `Trainer Clients.dc.html`, `Trainer Client Detail.dc.html`, `Trainer Availability.dc.html`, `Trainer Event Types.dc.html`, `Trainer Integrations.dc.html`
- Logica/dati (riutilizzabili): `client-store.js`, `coach-clients.js`
- Runtime del prototipo (**NON portare**): `support.js`

### Come aprire i prototipi
Servire la cartella `designs/` con un web server statico e aprire i singoli `.dc.html` (dipendono da `support.js` accanto). Sono riferimenti visivi/comportamentali: leggere il markup per misure e stati esatti, e `client-store.js`/`coach-clients.js` per la logica.
