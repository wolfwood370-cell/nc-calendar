# Redesign UI da design handoff — consegna 2026-07-03

Branch: `redesign/ui-handoff`. Fonte: `design_handoff_nc_calendar/` (README + 12 prototipi).
Tutte le 12 schermate sono state allineate al design mantenendo intatta la logica di
prenotazione/crediti/blocchi esistente (Supabase). Gate: typecheck ✅ · build ✅ · lint
pulito sui file toccati (gli errori prettier pre-esistenti del repo restano invariati).

## Cosa è cambiato

**Globale** — token colore del design (BIA `#039be5`, riprogramma, semaforo presenze,
consulenza), `--primary`/`--ring`/`--destructive` shadcn sul brand (`#005685`, `#dc2626`),
focus visibile, transizione pagina (rispetta `prefers-reduced-motion`), campanella coach
nell'header globale.

**App Cliente** — Dashboard: campanella con pannello notifiche derivate, banner
promemoria ≤48h, card benvenuto e "Blocco completato", card "I tuoi progressi" (BIA)
con sparkline, card feedback a stelle, chip Conferma presenza sulla prossima sessione.
Dettaglio prenotazione: badge + bottone Conferma presenza. Store: barra bilancio
crediti. Profilo: badge percorso, statistiche, barre sessioni residue, voce Booster.

**App Coach** — Clienti: riepilogo, toggle griglia/tabella, ordinamento, card con
accento stato + barra pacchetto + prossima sessione + semaforo presenza. Dettaglio
cliente: pannello "Andamento BIA" (aggiungi/modifica/elimina, sempre ≥1) e "Note &
obiettivi" con autosave. Calendario: ✓ sui tile quando il cliente conferma (drag
NON toccato). Disponibilità: "Anteprima settimana" live. Panoramica: barre animate.

**Backend (da applicare!)** — migrazione `supabase/migrations/20260703090000_design_handoff_bia_feedback_notes.sql`:
tabelle `bia_measurements`, `session_feedback`, `coach_client_notes`, colonna
`bookings.client_confirmed_at` + RPC `confirm_booking_attendance`. **Finché la
migrazione non è applicata l'app funziona comunque**: le sezioni nuove mostrano lo
stato vuoto e la conferma presenza avvisa che la funzione non è ancora attiva.

## Messaggio pronto da incollare nella chat di Lovable

> Applica la migrazione SQL che trovi nel repository in
> `supabase/migrations/20260703090000_design_handoff_bia_feedback_notes.sql`
> (crea le tabelle bia_measurements, session_feedback, coach_client_notes e la
> colonna bookings.client_confirmed_at con la RPC confirm_booking_attendance).
> Dopo averla applicata, rigenera i tipi TypeScript di Supabase
> (src/integrations/supabase/types.ts). Non modificare altro.

## Checklist di verifica post-publish

1. Prenota una sessione da cliente → il pool si decrementa e appare sul calendario coach.
2. Riprogramma (dalla card e col drag sul calendario coach) → orario aggiornato ovunque; la conferma presenza si azzera.
3. Cancella → credito rimborsato (o perso se tardiva).
4. Conferma presenza da cliente → ✓ verde sul calendario coach.
5. Coach aggiunge misurazione BIA → grafico "I tuoi progressi" del cliente si aggiorna.
6. Cliente vota una sessione completata (stelle) → la card sparisce.
7. Archivia/ripristina cliente; toggle griglia/tabella; ordina per Presenza.
8. Sync Google Calendar invariato (nessun file gcal toccato).
