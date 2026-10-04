# Passata 08 — Notifiche

## Obiettivo
Il cliente sa cosa ha fatto il coach e cosa gli resta da fare; aprire una notifica segna letta solo quella.

## Punti audit
H8 (le notifiche non dicono cosa ha fatto il coach; aprirne una le segna lette tutte), O3.

## Riferimenti design
`designs/Cliente Notifiche.dc.html`. Per vedere le azioni del coach arrivare al cliente: aprire `Coach Calendario.dc.html` (dal pacchetto del coach) nella stessa cartella, spostare o annullare una sessione di Giulia e tornare alle notifiche del cliente.

## Schermate
- `screenshots/08-notifiche-01-elenco.png` — promemoria e tre azioni del coach.

## File del repo
`src/routes/client.notifications.tsx` (creata nella passata 01), `client-notifications-bell.tsx` (si toglie), `src/hooks/use-notifications.ts`, `src/lib/notifications.ts`, `supabase/functions/booking-notifications`, nuove migrazioni.

## Due fonti
**1. Promemoria calcolati** nel client, dai dati che la Home già carica:

| Voce | Icona e colore | Titolo | Testo | Apre |
|---|---|---|---|---|
| Presenza da confermare | `CalendarCheck` `#c2410c` | Conferma la tua presenza | Personal Training · mercoledì 30 settembre alle 10:00 («oggi», «domani» al posto della data) | dettaglio |
| Crediti da usare (fine blocco entro 7 giorni) | `Hourglass` `#c2410c` | Crediti da usare | 3 crediti da prenotare entro domenica 4 ottobre | Prenota |
| Pochi crediti (1–2, altrimenti) | `Coins` `#c2410c` | Ti resta 1 credito / Ti restano 2 crediti | Puoi aggiungerne con un Booster. / Per continuare parla con Marco. | Booster / Home |
| Valutazione | `Star` `#b45309` | Com'è andata? | Valuta la sessione di lunedì 28 settembre | dettaglio |

- Data della voce: conferma = il più recente tra «inizio − 48 ore» e il momento della prenotazione; crediti da usare = 7 giorni prima della fine del blocco; valutazione = fine della sessione.
- Stato «letta» per singola voce, salvato per utente (localStorage va bene). L'id contiene le parti che cambiano (`low-<cliente>-<crediti>`, `use-<cliente>-<blocco>-<crediti>`), così una situazione nuova torna non letta.

**2. Azioni del coach** dalla tabella `notifications` (destinatario = cliente):

| type | Icona e colore | Titolo | Testo | Apre |
|---|---|---|---|---|
| `booking.moved_by_coach` | `Repeat` `#005685` | Marco ha spostato una sessione | Personal Training · lun 5 ott 09:00 → lun 5 ott alle 10:00 | dettaglio |
| `booking.cancelled_by_coach` | `CalendarX` `#b91c1c` | Marco ha annullato una sessione | Personal Training di ven 9 ott alle 07:30 · credito restituito (oppure «· credito scalato») | dettaglio |
| `booking.created_by_coach` | `CalendarPlus` `#005685` | Nuova sessione in agenda | Personal Training · gio 1 ott alle 10:00 · inserita da Marco | dettaglio |
| `booking.no_show` | `UserX` `#b91c1c` | Assenza registrata | Personal Training di lun 28 set alle 09:00 · il credito è stato scalato | dettaglio |
| `credits.added` | `Coins` `#047857` | Crediti aggiunti | +1 Personal Training da Marco | Home |
| `block.renewed` | `Layers` `#047857` | È iniziato un nuovo blocco | Blocco 4 · i nuovi crediti sono disponibili | Home |
| `path.created` | `Rocket` `#047857` | Nuovo percorso | Percorso fisso · i crediti sono disponibili | Home |
| `bia.recorded` | `Activity` `#039be5` | Nuova misurazione BIA | Peso 61,2 kg · massa magra 25,3 kg | Home |

Payload con i dati per i testi (`booking_id`, `session_label`, `scheduled_at`, `old_scheduled_at`, `charged`, `quantity`, `sequence_order`, `path_type`, `weight`, `lean_mass`). Guardie di forma e `describeClientNotification` in `src/lib/notifications.ts`, come `describeNotification` per il coach.

## Layout
- Intestazione di pagina aperta «Notifiche»; «Indietro» torna alla pagina di provenienza o alla Home. `main` con padding 8px 16px 32px, colonna con gap 12.
- Riga in cima, padding 0 4px, `space-between`: 14 px `#41474f` «5 da leggere» / «Tutte lette»; testuale 14/700 `#005685` «Segna tutte come lette» (44 px), solo se ce ne sono.
- Vuoto: card padding 24px 20px, centrata, gap 8: `BellOff` 28 `#717880`; «Nessuna notifica» 17/700; 14 px line-height 1.5 «Qui arrivano i promemoria e gli avvisi quando Marco cambia una sessione.»
- Elenco con gap 8, dalla più recente. Riga: pulsante, altezza minima 72, padding 14, raggio 18, riga con gap 12, allineamento in alto:
  - non letta: fondo bianco, bordo 1px `rgba(0,86,133,0.25)`, pallino 10 px `#005685` a destra (margin-top 6);
  - letta: fondo `rgba(255,255,255,0.55)`, bordo 1px `rgba(193,199,208,0.35)`, senza pallino;
  - riquadro 40×40 raggio 12 col colore al 10% e icona 20; titolo 15/700; testo 14 px line-height 1.4 `#41474f`; tempo 12 px `#41474f` con `formatAgo` («adesso», «25 min fa», «3 ore fa», «ieri», «5 giorni fa»);
  - nome accessibile «Non letta. Marco ha spostato una sessione. Personal Training · …».
- Tocco: segna letta solo quella voce (`mark_notification_read` per le righe del database, id locale per i promemoria), poi apre la destinazione (il dettaglio con la provenienza, per tornare qui).
- Il badge della campanella (passata 01) conta le non lette di entrambe le fonti.

## Dati e backend
Proporre e aspettare conferma. Trigger `AFTER INSERT/UPDATE` che scrivono in `notifications` con `recipient_id = client_id`, solo quando chi agisce non è il cliente (`auth.uid() <> client_id`) e non è un processo di sistema:
- `bookings` UPDATE di `scheduled_at` → `booking.moved_by_coach`;
- `bookings` UPDATE di `status` a `cancelled` / `late_cancelled` → `booking.cancelled_by_coach` (`charged = status = 'late_cancelled'`);
- `bookings` UPDATE di `status` a `no_show` → `booking.no_show`;
- `bookings` INSERT con `client_id` diverso dal coach, non personale e non importata → `booking.created_by_coach`;
- `extra_credits` INSERT fatto dal coach (non dal webhook di Stripe) e aumenti di `block_allocations.quantity_assigned` → `credits.added`;
- `training_blocks` INSERT: rinnovo → `block.renewed`; primo blocco di un percorso → `path.created`;
- `bia_measurements` INSERT → `bia.recorded`.
Esclusi sincronizzazione, importazione e riconciliazione di Google (service role), per non generare rumore. Realtime è già attivo su `notifications`. Push facoltativa con lo stesso testo, se l'app è installata e le notifiche sono attive.

## Accettazione
- Spostare, annullare, segnare assente o aggiungere crediti dal lato coach fa comparire la notifica al cliente in tempo reale, con il collegamento giusto.
- Aprire una notifica segna letta solo quella; «Segna tutte come lette» le segna tutte.
- Il badge della campanella corrisponde alle non lette.
- Le notifiche del coach non cambiano.

## Fuori scope
Preferenze per tipo di notifica.
