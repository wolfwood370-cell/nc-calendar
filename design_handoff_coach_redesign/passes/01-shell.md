# Passata 01 — Shell: sidebar e header

## Obiettivo
Sidebar divisa in lavoro e impostazioni; header che orienta (dove sono) e offre azioni globali (cerca cliente, crea, notifiche che portano all'evento).

## Punti audit
S1, S2, S3, S4, V12.

## Riferimenti design
`designs/Coach Sidebar.dc.html`, `designs/Coach Header.dc.html` (visibili in ogni pagina del prototipo).


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/01-shell-01-notifiche.png`
- `screenshots/01-shell-02-menu-nuovo.png`

## File del repo
`src/routes/trainer.tsx` (header desktop), `src/components/trainer-sidebar.tsx`, `src/components/trainer-notifications-bell.tsx`.

## Sidebar (256px)
- Logo + «NC Calendar» (Sora 14/600) + «Studio» (12, `outline`), padding 16px.
- Due gruppi con etichetta (11/600 maiuscolo, letter-spacing 0.05em, `outline`, altezza 32px, padding 0 12px):
  - **Area di lavoro**: Panoramica (`LayoutDashboard`), Calendario (`CalendarDays`), Clienti (`Users`).
  - **Impostazioni**: Tipologie di sessione (`Tag`), Disponibilità (`Clock`), Integrazioni (`Plug`).
- Voce: altezza 36px, radius pill, padding 0 12px, gap 12px, icona 16px, testo 14. Attiva: 600, `aura-primary`, fondo `rgba(0,62,98,0.1)`, `aria-current="page"`. Inattiva: 500, `on-surface-variant`; hover fondo `rgba(0,62,98,0.06)`.
- **Badge su Calendario**: numero di eventi Google da assegnare (stessa query del filtro «Da assegnare»); 20px, pill, fondo `rgba(124,67,2,0.12)`, testo `#7c4302` 11/700; `aria-label="N eventi da assegnare"` (V12). Nascosto se 0.
- Card utente in basso: avatar iniziali 32px (fondo primario, testo bianco), nome 14/600, email 12 `outline`, pulsante «Esci».

## Header (56px, sticky, fondo `rgba(255,255,255,0.4)` + blur)
Il pulsante per comprimere la sidebar e l'etichetta fissa «Studio Trainer» si tolgono.
- **Percorso (S1)** a sinistra: «Pagina» (14/600) oppure «Genitore › Pagina». Il genitore è un link solo se ha una pagina (es. «Clienti › Giulia Bianchi»); «Impostazioni» è testo semplice. Il percorso non si restringe: si accorcia con ellissi solo se il titolo è molto lungo.
- **Ricerca clienti (S2)**: campo pill 38px, larghezza fino a 300px (si restringe fino a 150px per primo), icona `Search`, placeholder «Cerca cliente», chip «⌘K». Scorciatoia ⌘K / Ctrl+K. Risultati in un popover (max 6): avatar, nome, piano; frecce su/giù + Invio; clic → profilo. Cerca per nome, email e telefono (≥ 3 cifre); esclusi gli archiviati. Nessun risultato: «Nessun cliente trovato per «q».».
- **Nuovo** (pulsante primario 38px, `Plus` + «Nuovo» + `ChevronDown`): menu con «Nuova sessione» (→ Calendario con dialog di creazione aperto, passata 04) e «Nuovo cliente» (→ Clienti con dialog aperto, passata 05). Usare search params (`?new=sessione`, `?new=cliente`).
- **Notifiche (S4)**: campanella 38px; badge conteggio non lette (99+ oltre 99). Popover 360px «Attività clienti» con «Segna tutte come lette». Riga: icona (`CalendarPlus` nuova prenotazione, `Repeat` spostamento), titolo 13/700, «Cliente · Tipologia», quando («mer 30 set · 18:00» oppure «vecchio → nuovo»), «N min fa · Apri nel calendario», pallino se non letta. **Clic: segna letta e apre il Calendario sulla data dell'evento con l'evento selezionato** (`/trainer/calendar?date=YYYY-MM-DD&event=<id>`; richiede la passata 04 per leggere i parametri: fino ad allora basta la data).

## Accettazione
- Da ogni pagina coach: ricerca con ⌘K, apertura profilo con Invio; Esc chiude popover.
- Clic su una notifica porta alla settimana giusta.
- Il badge del Calendario coincide con il numero di eventi da assegnare.
- A 1024px di larghezza del contenuto il titolo nel percorso non viene tagliato.

## Fuori scope
Header mobile e `TrainerBottomNav` (restano come sono).
