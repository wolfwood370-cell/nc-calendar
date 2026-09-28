# Passata 06 — Booster

## Obiettivo
Sapere prima di pagare quanti crediti si comprano, per quale tipologia e fino a quando valgono; vedere l'esito dopo il pagamento. Chi non può acquistare vede perché e come contattare il coach.

## Punti audit
S1 (scadenza contraddittoria), S2 (prodotti scritti nella pagina), S3 (nessun esito dopo il pagamento), S4 («Ricarica crediti» compra sempre una PT), S5 (pagina bloccata per chi non può acquistare), H7, V12, V14.

## Riferimenti design
`designs/Cliente Booster.dc.html`: Giulia può acquistare, Elena e Davide no. Il pagamento nel prototipo è simulato.

## Schermate
- `screenshots/06-booster-01-pagina.png`
- `screenshots/06-booster-02-riepilogo.png`
- `screenshots/06-booster-03-pagamento-completato.png`
- `screenshots/06-booster-04-elena-non-acquistabile.png`

## File del repo
`src/routes/client.store.tsx` (pacchetti scritti nel codice alle righe 40–66, `canPurchaseAddons`, testo sulla scadenza alla riga 300), `booster-card.tsx`, `owned-booster-card.tsx`, `supabase/functions/booster-checkout/index.ts`, `supabase/functions/stripe-webhook/index.ts`, tabella `booster_packs`, trigger `validate_booking_extra_credits`.

## Chi può acquistare
Cliente non archiviato, con percorso fisso o abbonamento e un blocco in corso: la stessa condizione che `booster-checkout` verifica sul server. Tutti gli altri vedono solo la card «I Booster si aggiungono a un percorso».

## Search params
`type=<event_type_id>` mette in evidenza e in testa i prodotti di quella tipologia; `booster=success|cancel` è l'esito del ritorno da Stripe.

## Layout
Intestazione di scheda «Booster» con sottotitolo «Crediti in più per il blocco in corso». `main` con padding 8px 16px 32px, colonna con gap 16.

### Non può acquistare (S5) — Elena, Davide
Card padding 20, gap 12: riquadro 48×48 raggio 14 `rgba(0,86,133,0.1)` con `Sparkles` 24 `#005685`; «I Booster si aggiungono a un percorso» 17/700; testo 15 px line-height 1.5 `#41474f`:
- percorso concluso: «Il tuo percorso è concluso. Per ripartire, Marco ti propone il prossimo percorso: i Booster si aggiungono a quello.»
- cliente libero: «Hai crediti senza scadenza fuori da un percorso. Se ti servono altre sessioni, Marco può aggiungerle o proporti un percorso.»
- altri casi: «Al momento non hai un blocco attivo. Scrivi a Marco per continuare.»

Principale «Scrivi a Marco su WhatsApp». Nessuna card prodotto, nessun pulsante disattivato, nessun «Accesso limitato».

### Validità (S1)
Riquadro con gap 12, padding 14px 16px, raggio 18, fondo `rgba(0,86,133,0.07)`; `Info` 18 `#005685`; 14 px line-height 1.5 `#191c1f`: «Si aggiungono ai crediti del blocco 3 e valgono fino a domenica 11 ottobre, come gli altri. Le sessioni si prenotano entro quella data.» La data è quella che verrà scritta in `extra_credits.expires_at` (vedi «Dati e backend»).

### Acquistati in questo blocco
Se ci sono acquisti nel blocco in corso: card raggio 24, bordo, padding 14px 16px, gap 10; titolo 15/700; righe `space-between` 14 px: «+1 Personal Training» 600 e «sab 19 set · 40 €» `#41474f` `tabular-nums`. Sostituisce le card dei Booster posseduti con la loro scadenza e «Ricarica crediti» (S1, S4).

### Prodotti (S2, S4)
- Da `booster_packs` attivi, collegati alla tipologia come fa il checkout. Titolo con la quantità: «1 sessione Personal Training», «3 sessioni Personal Training», «1 test funzionale».
- Card `article` raggio 24, bordo 1.5px `rgba(193,199,208,0.35)` (`#005685` se la tipologia è quella di `type`), ombra, padding 18, gap 12.
- Etichetta «Più conveniente» sul pacchetto col prezzo per credito più basso tra quelli della stessa tipologia (solo se ce n'è più d'uno): in alto a −11px, a destra 18px, 12/700, padding 3px 10px, raggio 9999, fondo `#003e62`, testo bianco.
- Riga: riquadro 44×44 raggio 14 con icona 22; titolo 17/700; descrizione 14 px line-height 1.45 `#41474f`; 13 px `#41474f` «60 min a sessione» (+ « · si prenota con Marco» se la tipologia non è prenotabile online).
- In fondo: prezzo Sora 24/700 `tabular-nums` «99 €» e sotto 13 px `#41474f` «33 € a sessione» (pacchetti da più crediti) o «1 credito»; a destra azione di riga piena «Acquista» (48 px, padding 0 22px, 15/700).
- In fondo alla pagina, centrato, 13 px: «Il pagamento avviene sulla pagina sicura di Stripe. I crediti compaiono appena il pagamento è completato.»

### Riepilogo — foglio «Riepilogo»
- Riquadro `#f8f9fe` raggio 18, padding 14px 16px, gap 10: riga `space-between` 15/700 con titolo e prezzo; `CalendarRange` 16 + 14 px «Valgono fino a domenica 11 ottobre, fine del blocco 3.»; `Coins` 16 + 14 px «Dopo l'acquisto avrai 4 crediti Personal Training disponibili.»
- Principale «Paga 40 € con Stripe» (`Lock` 16) → `booster-checkout` e reindirizzamento; durante l'attesa indicatore e pulsante disattivato. Testuale «Indietro».
- Se durante il riepilogo il cliente non può più acquistare, il foglio si chiude (V12).

### Esito (S3)
- **Riuscito** (`booster=success`): foglio «Pagamento completato»: riquadro 56×56 raggio 18 success-soft con `CircleCheck` 28; testo 15 px «+1 credito Personal Training. Ora ne hai 4 disponibili. Marco vede l'acquisto nelle notifiche.»; principale «Prenota ora» → `/client/book?eventType=<id>` (tipologia non prenotabile online: «Scrivi a Marco per fissarlo», WhatsApp); testuale «Chiudi». Poi togliere i parametri dall'URL.
  - I crediti arrivano dal webhook, anche con qualche secondo di ritardo: finché la riga in `extra_credits` non c'è, il testo è «Pagamento ricevuto: i crediti arrivano tra qualche secondo.» e si ricarica ogni 2 s per 20 s; poi «I crediti non sono ancora arrivati. Se non compaiono entro qualche minuto scrivi a Marco.»
- **Annullato** (`booster=cancel`): toast info «Pagamento non completato: nessun addebito.»

## Dati e backend
Descrivere il comportamento attuale, proporre e aspettare la scelta.
1. **Validità (S1).** Oggi `booster-checkout` scrive in `expires_at` il `valid_until` più lontano del blocco, più 30 giorni se ne mancano meno di 7; `validate_booking_extra_credits` non controlla `expires_at` («i crediti extra non scadono»); la pagina dice «scadono al termine del blocco» e la card del Booster posseduto mostra un'altra data. Opzioni:
   - **a. Regola del prototipo:** i Booster valgono fino alla fine del blocco in corso. Il checkout scrive la fine del blocco senza proroga; il trigger rifiuta le prenotazioni oltre `expires_at`; Prenota limita i giorni a quella data (passata 00).
   - **b. Proroga di 30 giorni:** si tiene la regola attuale, e riepilogo, riquadro di validità e Prenota mostrano la data reale; il trigger rifiuta comunque oltre `expires_at`.
   In entrambi i casi la data mostrata prima di pagare deve venire dallo stesso calcolo del checkout (RPC o funzione condivisa), non da una copia.
2. **Prodotti (S2).** Leggere `booster_packs` dal client (verificare la policy di lettura). Per titoli come «1 test funzionale» aggiungere colonne facoltative `title` e `description`; senza titolo si compone «N crediti <tipologia>».
3. **Ritorno da Stripe (S3).** In `booster-checkout`: `success_url` → `/client/store?booster=success&type=<event_type_id>`, `cancel_url` → `/client/store?booster=cancel`, mantenendo l'elenco degli origin consentiti.
4. **Avviso al coach.** Verificare che `stripe-webhook` crei una notifica per il coach; se no, aggiungere il tipo `booster.purchased` (campanella del coach: «Acquisto Booster · Giulia Bianchi · +3 Personal Training»).

## Accettazione
- Ogni prodotto dice nel titolo quanti crediti contiene.
- La data «valgono fino a» è la stessa salvata in `expires_at` e usata da Prenota.
- Dopo il pagamento di prova la pagina mostra l'esito e i crediti aggiornati; dopo l'annullamento «nessun addebito».
- Elena e Davide vedono solo la spiegazione e WhatsApp.
- Nessun «Ricarica crediti», «NC Add-on», «Acquista Ora», «Miglior Valore».

## Fuori scope
Prezzi e pacchetti lato coach.
