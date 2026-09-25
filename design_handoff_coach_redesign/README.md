# Handoff: redesign lato Coach (desktop) — NC Calendar

## Overview
Redesign delle 7 pagine desktop del lato Coach di NC Calendar (Panoramica, Calendario, Clienti, Profilo cliente, Tipologie di sessione, Disponibilità, Integrazioni) più la struttura comune (sidebar, header) e i dialog condivisi. Nasce da un audit UX/UI del codice attuale: 53 problemi (3 alta, 22 media, 28 bassa) più una seconda verifica (V1–V12) e quattro decisioni di prodotto (O1–O4). Ogni correzione è marcata nel prototipo con il codice del punto di audit (es. `P2`, `C6`, `K1`).

Il lavoro è diviso in **11 passate** ordinate per dipendenza: ogni passata è un brief autonomo in `passes/`, da svolgere in una sessione/PR separata.

## About the Design Files
I file in `designs/` sono **riferimenti di design creati in HTML**: prototipi che mostrano aspetto e comportamento voluti, **non codice da copiare in produzione**. Il compito è **ricreare questi design nel codebase esistente** (`nc-calendar`: React + TanStack Router + TanStack Query + Supabase + Tailwind v4 + componenti shadcn in `src/components/ui`), usando i pattern, gli hook dati e le librerie già presenti.

- I prototipi usano un archivio dati finto (`designs/nc-store.js`, localStorage) al posto di Supabase. Serve solo a simulare il comportamento: in app si usano le query/mutation esistenti (`src/lib/queries.ts`, `src/lib/query-keys.ts`, RPC Supabase).
- Gli stili nei prototipi sono inline per ragioni di strumento: in app vanno espressi con classi Tailwind e token di `src/styles.css`.
- Solo **desktop (≥ md)**. I layout mobile esistenti (`block md:hidden`) **non vanno toccati**.

### Come aprire il prototipo
Aprire `designs/Coach Panoramica.dc.html` in un browser (servito da un web server locale, es. `npx serve designs`). La navigazione tra pagine funziona dalla sidebar. Il pulsante «Ripristina i dati» in fondo alla Panoramica riporta i dati di esempio allo stato iniziale. L'audit completo è in `designs/Audit Coach Desktop.dc.html`.

## Schermate
`screenshots/` contiene 27 immagini del prototipo, con prefisso uguale al numero della passata (es. `04-calendario-02-pannello-dettagli.png` → passata 04). Ogni brief elenca le sue.
- Sono catturate a scala ridotta per mostrare l'intera pagina desktop: le misure esatte vanno prese dal brief o dal prototipo, non dai pixel.
- I dati sono quelli di esempio del 25/09/2026 alle 10:40 (ora simulata).
- Le etichette arancioni con i codici di audit (C1, K4…) presenti nel prototipo sono nascoste nelle schermate.
- Alcuni dialog sono mostrati per intero anche se nel prototipo scorrono.

## Fidelity
**High-fidelity.** Colori, tipografia, spaziature, testi e interazioni sono definitivi. Ricreare l'interfaccia fedelmente usando i componenti del codebase (Dialog, AlertDialog, Popover, Select, Switch di shadcn; `sonner` per i toast). Dove il prototipo e questo README divergono, vale il README; dove il README tace, vale il prototipo (i valori esatti sono negli attributi `style` dei file `.dc.html`).

## Come lavorare per passate
1. Seguire l'ordine in `CHECKLIST.md`. Le passate 00–02 sono prerequisiti delle altre.
2. Una passata = un branch (`redesign/coach-NN-nome`) = una PR. Non anticipare lavoro di passate successive.
3. All'inizio di ogni passata: leggere il brief in `passes/`, aprire le pagine di riferimento del prototipo, leggere i file del repo elencati.
4. Alla fine: `npm run build`, typecheck e lint puliti; verificare a mano i criteri di accettazione del brief; spuntare `CHECKLIST.md`.
5. Se una passata richiede modifiche al database (sezione «Dati e backend» del brief), fare prima la migrazione e l'eventuale rigenerazione dei tipi Supabase, poi la UI.
6. Se un'indicazione del brief non è realizzabile con il backend attuale, fermarsi e annotarlo nella PR invece di inventare un comportamento.

## Regole trasversali (valgono in tutte le passate)
- **Lingua e maiuscole (T1, T6):** italiano, solo iniziale maiuscola («Aggiungi cliente», non «Aggiungi Cliente»). Glossario: *NC Calendar* (prodotto), *Clienti* (mai «atleti»), *Tipologie di sessione* (mai «tipi di evento», «servizi», «event type»), *crediti* come unità dei pacchetti («2 crediti rimasti», singolare «1 credito rimasto»).
- **Titoli (T2):** H1 di pagina Sora 36px/700, letter-spacing −0.02em, line-height 1.15, colore `#191c1f`. Titolo card 20px/600 Manrope. Titolo dialog Sora 22px/700; titolo dialog di conferma Sora 19px/700.
- **Conferme (T5):** mai `confirm()` del browser; sempre `AlertDialog`.
- **Annulla vs Ripristina (V1):** i toast di conferma con possibilità di tornare indietro hanno l'azione **«Ripristina»** (mai «Annulla», che è riservato a chiudere un dialog o ad annullare una sessione). Durata toast con azione: 8 s; senza azione: ~3 s.
- **Stato nell'URL (T4):** filtri, viste, tab e selezioni vivono nei search params della route (`validateSearch` di TanStack Router), come già fatto per `reviewEventId`.
- **Colori di stato (T3):** usare token, non valori scritti a mano (vedi Design Tokens).
- **Accessibilità:** controlli segmentati con `role="radiogroup"`/`role="radio"` o `tablist`/`tab`, navigabili con frecce, Home, End (O3). Pulsanti solo icona con `aria-label`. Contrasto testo ≥ 4.5:1.

## Design Tokens
Token esistenti in `src/styles.css` (usare questi nomi):

| Uso | Token | Valore |
|---|---|---|
| Primario | `--color-aura-primary` | `#003e62` |
| Primario hover / pulsante check-in | `--color-primary-container` | `#005685` |
| Testo | `--color-on-surface` | `#191c1f` |
| Testo secondario | `--color-on-surface-variant` | `#41474f` |
| Testo terziario, label | `--color-outline` | `#717880` |
| Bordi tenui, anelli radio | `--color-outline-variant` | `#c1c7d0` |
| Bordi input/card | `--color-surface-variant` | `#e1e2e7` |
| Fondo controlli segmentati | `--color-surface-container` | `#eceef2` |
| Fondo campi, riquadri | `--color-surface-container-low` | `#f2f3f8` |
| Fondo pagina | `--color-surface` | `#f8f9fe` |
| Avatar clienti | `--color-avatar-placeholder` | `#d6e5ec` (testo `#3b494f`) |
| Avatar agenda oggi | `--color-secondary-container` | `#b2d8ff` (testo `#385f81`) |
| Terziario (da assegnare) | `--color-tertiary-container` | `#7c4302` |
| Badge notifiche | `--color-error-bright` | `#e53935` |

**Token nuovi da aggiungere** (passata 00) — le versioni «-strong» esistenti (`#059669`, `#ea580c`, `#dc2626`) non raggiungono 4.5:1 sui fondi chiari a 11–12px:

| Token proposto | Valore | Uso |
|---|---|---|
| `--color-success-text` / `--color-success-soft` | `#047857` / `#ecfdf5` | chip «Attivo», «Svolta», conferme |
| `--color-warning-text` / `--color-warning-soft` / `--color-warning-line` | `#c2410c` / `#fff7ed` / `#fed7aa` | «In scadenza», «Da confermare», avvisi |
| `--color-danger-text` / `--color-danger-soft` / `--color-danger-line` | `#b91c1c` / `#fef2f2` / `#fecaca` | «Assente», azioni distruttive, errori |
| `--color-assign-soft` / `--color-assign-line` | `rgba(255,220,194,0.55)` / `#f59e0b` (tratteggiato) | eventi da assegnare |

Tipografia: Sora (display: H1, titoli dialog, numeri grandi) e Manrope (tutto il resto). Scala: 11 (chip, 700), 12 (meta), 13 (label 700, pulsanti piccoli), 14 (corpo, pulsanti), 15–16 (nomi in evidenza), 20 (titolo card 600), 22 (titolo dialog), 36 (H1).

Raggi: card di pagina 28px, card di elenco 24px, dialog 28px, dialog di conferma 24px, riquadri interni 16–20px, input 14px, pulsanti e chip 9999px.

Ombre: card `0 4px 20px rgba(0,86,133,0.05)`; popover/menu `0 20px 60px rgba(0,0,0,0.16)`; dialog `0 30px 80px rgba(0,0,0,0.25)`; toast `0 16px 48px rgba(0,0,0,0.18)`. Overlay dialog `rgba(25,28,31,0.32)`.

Spaziature: padding `main` 28px 40px 48px (120px in basso nelle pagine con barra di salvataggio); gap tra card 20px; padding card 24px; padding dialog 28px (24px conferme).

Altezze controlli: CTA di pagina 42px; pulsanti dialog 40px; azioni di riga 34–38px; tab di pagina 36px; controlli segmentati di toolbar e dialog 32px; selettore compatto 28px; input 40–42px.

Colori delle tipologie: palette Google Calendar già in `src/lib/event-colors.ts` più «Blu studio» `#003e62`.

## Dati e backend — riepilogo
Voci che richiedono lavoro lato Supabase (dettagli nei brief):
- **P2 / O1** annulla check-in e cancellazione tardiva: verificare che `bookings.status` torni a `scheduled` senza effetti collaterali; per «Addebita il credito» serve lo stato `late_cancelled` (già usato in `trainer.clients.index.tsx`) e un parametro nell'RPC `cancel_booking` o una RPC coach dedicata.
- **C6** creazione sessione dal coach: oggi non esiste; serve un percorso di inserimento che passi dai trigger esistenti (`validate_booking_block_allocation`) e crei l'evento Google.
- **K4** campo «Limitazioni»: nuova colonna accanto all'obiettivo nelle note coach.
- **D6** eccezioni su periodo: colonna `end_date` (o una riga per giorno raggruppata in UI).
- **D1 / D2** preavviso e anticipo in sola lettura; prima di togliere il buffer globale verificare quale margine usa il motore degli slot (`client.book.tsx`, `get_coach_busy`).
- **I1** stato reale di Google Calendar: ricavarlo da `gcalListEventsForReview` / ultima riconciliazione.

## Assets
Logo `designs/assets/ncc-logo.png` (già nel repo in `src/assets/`). Icone: Lucide (`lucide-react`, già usato); i nomi usati nel prototipo coincidono con i componenti Lucide (`CalendarDays`, `CircleCheck`, `UserX`, `Undo2`, …).

## Files
- `CHECKLIST.md` — ordine delle passate e stato.
- `screenshots/` — schermate di riferimento per passata.
- `passes/00-fondamenta.md` … `passes/10-verifica-finale.md` — un brief per passata.
- `designs/Audit Coach Desktop.dc.html` — audit completo (53 punti + seconda verifica + decisioni).
- `designs/Coach *.dc.html` — prototipo: 7 pagine, `Coach Sidebar`, `Coach Header`, dialog condivisi `Coach Assegna Evento`, `Coach Pacchetto`, `Coach Annulla Sessione`.
- `designs/nc-store.js` — logica e regole di dominio del prototipo (utile come specifica: `renewalInfo`, `creditsOf`, `attendance`, `todaySessions`, `isLate`).
- `designs/nc-icons.js`, `designs/support.js` — runtime del prototipo, non servono in app.
