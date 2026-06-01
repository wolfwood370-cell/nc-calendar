
# Pulizia + reimplementazione Google Calendar via connettore Lovable

Scenario scelto: **tu sei l'unico coach** → tutti gli eventi finiscono sul tuo unico Google Calendar (quello collegato al connettore `NC Personal Trainer - Calendar`). Niente più OAuth per-coach.

## 1. Linkare il connettore al progetto

Connettore `google_calendar` già esistente in workspace (`std_01kt1tt1ztexybz3t2gp3fm1y1`), non ancora linkato → linkarlo per esporre `GOOGLE_CALENDAR_API_KEY` + `LOVABLE_API_KEY` al server runtime.

## 2. Codice da rimuovere

**Edge function**
- `supabase/functions/sync-calendar/` (1594 righe) → `delete_edge_functions(["sync-calendar"])`

**File frontend / shared**
- `src/lib/sync-calendar.ts`
- `src/hooks/use-gcal-watch-renewal.ts`
- `src/routes/api/public/webhooks/gcal-watch.ts` (più nessun push: il calendario è tuo, la app è la sola sorgente di verità)
- `src/lib/calendar-utils.ts` (duplicato di `src/lib/calendar.ts`)
- Componente `TokenExpiryBadge` e blocco "Connetti / Disconnetti Google" in `src/routes/trainer.integrations.tsx`

**Tutte le chiamate**: `syncCalendar(...)` / `syncCalendarAwait(...)` / `useGcalWatchRenewal(...)` in:
`hooks/use-book-confirm.ts`, `lib/queries.ts`, `routes/trainer.calendar.tsx`, `routes/trainer.integrations.tsx`, `components/calendar-manage-sheet.tsx`, `components/client-reschedule-sheet.tsx`, `components/reschedule-drawer.tsx`, `components/edit-booking-dialog.tsx`, `components/review-booking-dialog.tsx` → sostituite con i nuovi server fn (vedi §4) o rimosse (`register_watch`, `mirror_check`, `import_history` non servono più).

**Secrets Supabase obsoleti** (chiedo conferma prima di cancellarli): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.

## 3. Migration database

Drop di tutte le colonne/tabelle dedicate all'OAuth per-coach:

- `integration_settings`: drop colonne `gcal_enabled`, `gcal_refresh_token`, `gcal_access_token`, `gcal_token_expiry`, `gcal_calendar_id`, `gcal_channel_id`, `gcal_channel_token`, `gcal_channel_expires_at`, `gcal_resource_id`, `gcal_last_sync_at`, ecc.
- `profiles.gcal_invite_enabled` → drop (l'invito attendee sarà sempre disponibile, gestito lato server fn con email del cliente).
- Tabella `gcal_sync_signals` → drop (era il watermark per i push webhook, ora superfluo).
- Colonna `bookings.google_event_id` → **mantenuta** (serve per update/cancel sull'evento giusto).

## 4. Nuova architettura (TanStack server functions)

File `src/lib/gcal.functions.ts` (server-only, importa `@/integrations/lovable/...` no: usiamo direttamente fetch al gateway).

Gateway: `https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars/primary/events`
Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${GOOGLE_CALENDAR_API_KEY}`.

Server functions esposte (con `requireSupabaseAuth` middleware):

| Nome | Cosa fa | Chiamata da |
|------|---------|-------------|
| `gcalCreateEvent` | POST `/events?conferenceDataVersion=1&sendUpdates=all` — crea evento, opz. richiede Google Meet (`request_meet`), aggiunge attendee (email cliente), reminders golden (online=30m+24h, presenza=2h+24h). Scrive `bookings.google_event_id` e `bookings.meeting_link`. | conferma prenotazione, creazione manuale |
| `gcalUpdateEvent` | PATCH `/events/{id}?sendUpdates=all` — aggiorna start/end/summary/colore quando si sposta o modifica un booking. | reschedule, edit booking |
| `gcalCancelEvent` | DELETE `/events/{id}?sendUpdates=all` — cancella evento Google, distinguendo "late" solo nel testo. Null-safe se `google_event_id` mancante. | cancellazione, late cancel |

Tutte le server fn:
- validano input con Zod
- restituiscono DTO (no `Response` raw)
- in caso di errore loggano + ritornano `{ok:false, error}` così le UI mostrano il toast non-bloccante esistente

Helper client `src/lib/gcal-client.ts` con wrapper `useServerFn(gcalCreateEvent)` ecc., così le call site cambiano solo nome funzione (da `syncCalendar({action:"create",...})` a `gcalCreate.mutate(...)`).

## 5. UI `/trainer/integrations`

- Rimuovo card "Google Calendar" con Connect/Disconnect/refresh-token/TokenExpiryBadge.
- Sostituisco con card statica: "Google Calendar collegato via Lovable Cloud — gli eventi vengono sincronizzati automaticamente sul calendario del coach."
- Rimuovo bottoni "Sincronizza ora" / "Diagnostica sync" / "Importa storico" (azioni non più disponibili nel nuovo modello pull-based su singolo calendario).

## 6. Verifica finale

- Build pulita (tsc + vite).
- Test manuale flusso: prenotazione client → evento creato sul calendario condiviso, reschedule → evento spostato, cancel → evento eliminato.
- Niente più referenze a `sync-calendar`, `gcal_*`, `useGcalWatchRenewal`, `integration_settings.gcal_*`.

## Note tecniche per chi legge

- Tutto è server-side: `LOVABLE_API_KEY` e `GOOGLE_CLIENT_*` non finiscono nel bundle client.
- L'autorizzazione resta `requireSupabaseAuth`: solo coach autenticati possono triggerare le server fn (anche se in pratica c'è un solo coach).
- Niente push notifications: il calendario è di proprietà dell'app, niente reconciliation bidirezionale.
- `bookings.google_event_id` resta la chiave per update/cancel.

Una volta approvato passo in build mode ed eseguo nell'ordine: link connettore → migration drop colonne → cancellazione file + edge function → nuove server fn → refactor call sites → cleanup `/trainer/integrations`.
