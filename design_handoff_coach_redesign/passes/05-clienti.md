# Passata 05 — Clienti

## Obiettivo
Un solo modo per aggiungere clienti, stati coerenti con il resto dell'app, schede interamente cliccabili, elenco che ricorda filtri e ordine.

## Punti audit
L1 (Aggiungi vs Invita), L2 (Completati senza tab), L3 (card cliccabile in parte), L4 (creazione con termini tecnici), L5 (inviti), L6 (menu), L7 (ordinamento), L8 (crediti), T4, V5.

## Riferimenti design
`designs/Coach Clienti.dc.html`.


## Schermate
Riferimento visivo fisso (dati di esempio del 25/09/2026, ora simulata 10:40). In caso di dubbio valgono i valori del brief e del prototipo.
- `screenshots/05-clienti-01-schede.png`
- `screenshots/05-clienti-02-tabella.png`
- `screenshots/05-clienti-03-nuovo-cliente.png`
- `screenshots/05-clienti-04-crea-account.png`

## File del repo
`src/routes/trainer.clients.index.tsx` (blocco desktop), `create-client-dialog.tsx`, `invite-client-dialog.tsx`, `credentials-dialog.tsx`, `client-card-menu.tsx`, `client-status-tabs.tsx`, `pending-invitations-card.tsx`.

## Search params (T4)
`q`, `stato=active|expiring|completed|archived`, `vista=tabella`, `ordina=left|expiry|activity|attendance`; `new=cliente` apre la scelta.

## Testata e filtri
- H1 «Clienti»; a destra **un solo** pulsante «Nuovo cliente» (`UserPlus`, 42px) (L1).
- Tab di stato 36px con conteggio: **Tutti · Attivi · In scadenza · Completati · Archiviati** (L2). «Tutti» esclude gli archiviati. Il conteggio di «In scadenza» è arancione se > 0. La barra riepilogo «N clienti / attivi / in scadenza» si toglie (duplicava i tab).
- Ricerca (max 420px) «Cerca per nome, email o telefono»; «Ordina per» (select): **Nome (A–Z) · Crediti residui · Scadenza del blocco · Ultima sessione svolta · Presenza più bassa** (L7); vista schede/tabella (radiogroup).

## Inviti in attesa (L5)
Solo nel tab Tutti, sopra le schede: card bianca con bordo tratteggiato, titolo «Inviti in attesa» + numero. Riga: avatar tratteggiato con iniziali, nome, «email · inviato 3 giorni fa»; «Reinvia» (riusa `sendInvitationEmail`, toast «Invito inviato di nuovo a …») e «Annulla invito» (toast con «Ripristina»).

## Scheda cliente (griglia `minmax(280px,1fr)`)
- **Tutta la scheda apre il profilo** (L3): `role="link"`, Invio/Spazio, hover bordo `outline-variant`. Il menu ⋮ ferma la propagazione.
- Contenuto: avatar 48px, nome 16/700, email; chip piano (`rgba(0,62,98,0.08)`, primario) + chip stato (Attivo `success`, In scadenza `warning`, Completato/Archiviato neutri); **crediti del blocco in corso** (L8): «Crediti del blocco 3 di 6» + «6 di 13 rimasti» e barra (arancione se in scadenza); per abbonamenti «Crediti del mese», per liberi «Crediti extra»; se in scadenza, riga con il motivo in `warning-text`; piè: `CalendarDays` + prossima sessione («sab 26 set · 18:00» o «Nessuna sessione in agenda») e presenza % (verde ≥ 80, arancione ≥ 60, rosso sotto; «—» se nessun dato) calcolata da `getAttendance` (V5).
- Archiviati al 72% di opacità.
- **Menu ⋮ (L6)**: «Apri profilo» · «Archivia»/«Ripristina» (immediato, toast con «Ripristina») · separatore · «Elimina…» (rosso) → AlertDialog «Eliminare definitivamente <Nome>?» con «Annulla», «Archivia invece», «Elimina».

## Tabella
Colonne: Cliente · Piano · Stato · Crediti (barra + «6/13») · Prossima sessione · Presenza · ⋮. Righe cliccabili da tastiera. Scroll orizzontale sotto 880px.

## Nuovo cliente (L1, L4)
1. **Scelta** (dialog 560px, due card): «Crea l'account ora» — «Imposti tu percorso e crediti. Ottieni una password da consegnare al cliente.» · «Invia un invito» — «Il cliente riceve un'email e completa la registrazione da solo. Il percorso lo assegni dopo.».
2. **Invito**: Nome e cognome, Email, Telefono (facoltativo, per WhatsApp) → «Invia invito».
3. **Crea l'account** (dialog 640px, indicatore a 3 passi «1 · Dati», «2 · Percorso e crediti», «3 · Riepilogo»):
   - Dati: Nome, Cognome, Email, Telefono (facoltativo). «La password viene generata automaticamente: la vedrai alla fine.».
   - Percorso: card radio «Percorso fisso» / «Abbonamento mensile» / «Cliente libero»; per il fisso durata segmentata «3 mesi · 6 mesi · 12 mesi · Personalizzata» (+ numero di blocchi); **crediti per blocco** con −/+ per tipologia (per i liberi «Sessioni omaggio»); scorciatoia «Usa «PT Pack 3 sessioni»»; nota «Uguali per ogni blocco. Potrai variarli per singolo blocco dal profilo del cliente.». Sostituisce le «regole» con «Event Type / Q.tà / Dal blocco / Al blocco».
   - Riepilogo: cliente, email, percorso, crediti per blocco, sessioni totali → «Crea cliente».
   - Esito nello stesso dialog: «Account creato per <Nome>.», email e password con «Copia» → «Copiata»; nota «Consegna la password al cliente in modo sicuro. Dopo aver chiuso questa finestra non sarà più visibile.»; «Apri profilo», «Crea un altro cliente», «Fatto». Il `CredentialsDialog` separato si toglie.

## Accettazione
- Tornando dal profilo, ricerca/tab/ordine/vista sono quelli di prima.
- Stessi clienti «In scadenza» della Panoramica.
- La presenza in scheda coincide con quella del profilo.
