# Passata 01 — Shell: barra, intestazioni, fogli, toast

## Obiettivo
La cornice comune di tutte le schermate del cliente: cinque schede con etichetta, due soli schemi di intestazione, un foglio dal basso, un toast, i pulsanti e l'installazione proposta senza interrompere.

## Punti audit
N2 (barra con sole icone), N3 (intestazioni diverse), N5 (installazione all'ingresso), O2 (cinque schede), T2 (aree di tocco), V4 (altezze dei pulsanti), V5 (raggi), V7 (colore del primario), V14 (nome «Booster»), H8 prima parte (pagina Notifiche al posto del popover).

## Riferimenti design
`designs/Cliente Tab Bar.dc.html`; intestazione di scheda in `Cliente Home.dc.html`, intestazione di pagina aperta in `Cliente Sessione.dc.html` e `Cliente Notifiche.dc.html`; foglio di installazione e toast in `Cliente Home.dc.html`.

## Schermate
- `screenshots/01-shell-01-foglio.png` — foglio «Installa NC Calendar».
- `screenshots/01-shell-02-toast-ripristina.png` — toast sopra la barra, con «Ripristina».
- Intestazione di scheda e barra: `05-home-01-prossima-da-confermare.png`. Intestazione di pagina aperta: `04-sessione-01-da-confermare.png`, `08-notifiche-01-elenco.png`.

## File del repo
`src/routes/client.tsx`, `client-bottom-nav.tsx`, `client-notifications-bell.tsx`, `pwa-onboarding.tsx`, `install-pwa-button.tsx`, `src/hooks/use-pwa.ts`, `src/components/ui/drawer.tsx`, `src/components/ui/sonner.tsx`, `head()` di tutte le route `client.*`. Nuovi: intestazione di scheda, intestazione di pagina aperta, foglio, foglio di installazione, pulsanti; route `client.sessions.tsx` e `client.notifications.tsx`.

## Barra in basso (N2, O2, V14)
- Cinque schede, in quest'ordine: **Home** `/client` (`Home`), **Prenota** `/client/book` (`CalendarPlus`), **Sessioni** `/client/sessions` (`CalendarDays`), **Booster** `/client/store` (`Sparkles`), **Profilo** `/client/settings` (`User`).
- Scheda attiva: Home solo sul percorso esatto; le altre per prefisso; `/client/bookings/*` accende Sessioni. `aria-current="page"` sulla scheda attiva.
- `nav` fissa in basso, larghezza piena, solo sotto `md`. Fondo `rgba(255,255,255,0.94)` con `backdrop-filter: blur(20px)`, bordo superiore 1px `rgba(193,199,208,0.45)`. Padding 6px 6px e in basso `max(6px, env(safe-area-inset-bottom))` (nel prototipo 30 px comprendono l'indicatore Home). `aria-label="Navigazione principale"`.
- Scheda: `flex: 1`, altezza 58, colonna centrata, gap 3. Pillola dell'icona 56×32, raggio 9999, fondo `rgba(0,86,133,0.12)` se attiva; icona 22. Etichetta 12 px, 700 se attiva, 600 altrimenti. Colore `#003e62` attiva, `#41474f` inattiva.
- Badge su Sessioni: numero di sessioni in programma con stato `toconfirm` (passata 00). Minimo 18×18, padding 0 5px, raggio 9999, fondo warning-text `#c2410c`, testo bianco 12/700, bordo 2px bianco, in alto a −2px e a destra 8px della pillola. Nome accessibile «Sessioni, 1 da confermare».
- Il contenuto di `main` ha in basso lo spazio della barra (6 + 58 + safe area) più 24 px.
- Header desktop di `client.tsx` (≥ md): le stesse cinque schede con gli stessi nomi più la campanella; via «Calendario».
- Le pagine aperte (Dettaglio sessione, Notifiche) non hanno la barra.

## Intestazioni (N3)
Due schemi, entrambi `position: sticky; top: 0`, sopra il contenuto, fondo `rgba(248,249,254,0.92)` con `backdrop-filter: blur(16px)`.

**Scheda** (Home, Prenota, Sessioni, Booster, Profilo):
- Padding 12px 20px 12px sotto la safe area (nel prototipo i 60 px in alto comprendono la barra di stato). Riga con allineamento in basso, `space-between`, gap 12.
- A sinistra, colonna con gap 4: H1 Sora 28/700, line-height 1.15, letter-spacing −0.02em, su una riga con ellissi (V10); sottotitolo 14 px `#41474f`.
- A destra la campanella: 44×44, tonda, fondo bianco, bordo 1px `rgba(193,199,208,0.6)`, icona `Bell` 20 `#41474f`. Badge non lette: minimo 20×20, padding 0 5px, raggio 9999, fondo `#e53935`, testo bianco 12/700, bordo 2px `#f8f9fe`, a −3px in alto e a destra; oltre 99 «99+» (`formatUnreadBadge`). Nome accessibile «Notifiche» / «Notifiche, 3 non lette» (`notificationsBellLabel`). Apre `/client/notifications`.
- Titoli e sottotitoli: Home «Ciao Giulia» + data di oggi «Lunedì 28 settembre»; Prenota «Prenota» + «Blocco 3 di 6 · fino a domenica 11 ottobre» («Abbonamento mensile · blocco 4 · fino a domenica 4 ottobre», «Crediti senza scadenza», «Percorso concluso»); Sessioni «Sessioni» + «6 sessioni in programma» («1 sessione in programma», «Nessuna sessione in programma»); Booster «Booster» + «Crediti in più per il blocco in corso»; Profilo «Profilo» senza sottotitolo.
- In Sessioni l'intestazione contiene anche il controllo segmentato (passata 03), sotto la riga del titolo con gap 14.

**Pagina aperta** (Dettaglio sessione, Notifiche):
- Padding 6px 12px 8px sotto la safe area (54 px nel prototipo). Griglia `44px 1fr 44px`, gap 8, allineamento al centro.
- Indietro: 44×44, tondo, fondo bianco, bordo 1px `rgba(193,199,208,0.6)`, icona `ChevronLeft` 22 `#003e62`, `aria-label="Indietro"`. Titolo centrato 17/700 («Sessione», «Notifiche»). Terza colonna vuota. Niente campanella.
- Indietro torna alla schermata di provenienza (D5): alla voce precedente della cronologia se è una pagina dell'app, altrimenti al ripiego (Sessione → `/client/sessions`, Notifiche → `/client`). Usare `useCanGoBack` + `router.history.back()` se la versione di TanStack Router lo offre, altrimenti un search param `from`.

## Foglio dal basso
Un componente per tutti i fogli (Sposta, Annulla, conferma della prenotazione, esito, riepilogo d'acquisto, password, installazione, «Come si prenota»). Basato su `components/ui/drawer.tsx` (vaul) se adatto, altrimenti su `Dialog` ancorato in basso.
- Fondo dietro `--color-scrim` `rgba(0,20,35,0.42)`; tocco fuori, Esc e trascinamento in basso chiudono.
- Pannello: fondo bianco, raggio 28px 28px 0 0, padding 10px 20px e in basso `max(24px, env(safe-area-inset-bottom) + 12px)` (40 px nel prototipo), colonna con gap 14 (16 negli elenchi), altezza massima 90% con scorrimento interno.
- Maniglia 40×5, raggio 9999, `#c1c7d0`, centrata. Titolo Sora 22/700, letter-spacing −0.01em.
- `role="dialog"` con `aria-modal` e titolo collegato; `role="alertdialog"` per le conferme distruttive. Focus intrappolato e restituito al pulsante che l'ha aperto.
- Pulsanti a tutta larghezza, in colonna: principale, secondario, testuale («Indietro», «Chiudi», «Tienila»).

## Toast (V1)
- `Toaster` di sonner per le route del cliente: in basso al centro, 12 px dai bordi laterali, 12 px sopra la barra (nel prototipo 106 px dal fondo; 44 px nelle pagine senza barra).
- Stile: fondo `--color-toast` `#191c1f`, testo bianco 14 px line-height 1.35, raggio 16, padding 8px 8px 8px 16px, gap 12, ombra `0 12px 32px rgba(0,0,0,0.25)`. Icona iniziale 18: ok `CircleCheck` `#6ee7b7`, avviso `TriangleAlert` `#fdba74`, info `Info` `#91cbff`.
- Azione «Ripristina»: altezza 44, padding 0 12px, raggio 12, testo `#91cbff` 14/700, senza fondo.
- Durata: 8 s con azione (`toastWithUndo`), 3,2 s senza.

## Pulsanti (V4, V7)
Varianti da usare in tutte le passate:
- **Principale**: altezza 52, raggio 9999, fondo `#005685`, testo bianco 16/700, premuto `#003e62`, icona 18 con gap 8. Disabilitato: fondo `#e1e2e7`, testo `#41474f`.
- **Secondario**: altezza 48, raggio 9999, bordo 1px `#c1c7d0`, fondo trasparente (bianco su fondi colorati), testo `#003e62` 15/600 (700 nel dettaglio sessione), icona 16.
- **Tonale**: altezza 44–48, raggio 9999, fondo `rgba(0,86,133,0.1)`, testo `#003e62` 14–15/700.
- **Testuale**: altezza 44, testo `#003e62` 15/600; distruttivo `#b91c1c` 15/700.
- **Distruttivo pieno**: altezza 52, fondo `#b91c1c`, testo bianco 16/700 (solo nel foglio di annullamento).
- **Azione di riga**: altezza 44, padding 0 16px, raggio 9999, 14/700, piena o con bordo.

## Installazione (N5)
- Togliere l'apertura automatica di `PwaOnboarding` (800 ms dopo il primo accesso).
- Foglio «Installa NC Calendar», aperto dalla card della Home (passata 05) e dalla voce del Profilo (07):
  - elenco numerato, gap 12: cerchi 32 px `#005685` con numero bianco 14/700; testo 15 px line-height 1.4. 1 «In Safari tocca Condividi» con icona `Upload` 18 `#005685`; 2 «Scegli «Aggiungi alla schermata Home»»; 3 «Apri NC Calendar dall'icona e attiva le notifiche dal Profilo» (dal Profilo: «…attiva le notifiche da qui»);
  - nota 13 px: «Su Android: menu del browser, poi «Installa app».»;
  - principale «Ho installato l'app» → toast «App installata: attiva le notifiche dal Profilo.»; testuale «Chiudi».
  - Dove il browser offre l'installazione diretta (`beforeinstallprompt`, `use-pwa.ts`), il pulsante principale è «Installa» e apre il prompt del sistema.
- App installata = `display-mode: standalone`: la card della Home sparisce e il Profilo mostra «App installata».

## Notifiche, prima parte (H8)
- Route `/client/notifications` con l'intestazione di pagina aperta «Notifiche». Sostituisce il popover di `client-notifications-bell.tsx`.
- In questa passata l'elenco mostra le voci calcolate di oggi (conferma, blocco, BIA, crediti, valutazione) con la riga descritta nella passata 08; lo stato «letta» resta com'è (localStorage per utente). La passata 08 aggiunge le azioni del coach e la lettura per singola voce.

## Sessioni, segnaposto
Route `/client/sessions` con l'intestazione di scheda «Sessioni» e, per ora, l'elenco attuale (`ClientSessionTimeline`). La passata 03 la sostituisce.

## Titoli della scheda del browser (T1)
«Home · NC Calendar», «Prenota · NC Calendar», «Sessioni · NC Calendar», «Sessione · NC Calendar», «Booster · NC Calendar», «Profilo · NC Calendar», «Notifiche · NC Calendar» (oggi «Area personale | NC Training Systems», «Acquista pacchetti | NC Training Systems», «Impostazioni | …», «Dettaglio appuntamento | …»).

## Accettazione
- Cinque schede con etichetta visibile e senza troncamenti a 320 px di larghezza.
- Tutte le pagine del cliente usano uno dei due schemi di intestazione; la campanella c'è nelle cinque schede.
- Nessuna finestra di installazione automatica.
- I toast stanno sopra la barra e non la coprono; i toast di azioni annullabili hanno «Ripristina».
- Aree di tocco di almeno 44 px nella barra, nelle intestazioni e nei fogli.
- Su desktop l'header ha le stesse cinque schede.

## Fuori scope
Contenuto delle pagine (passate 02–08).
