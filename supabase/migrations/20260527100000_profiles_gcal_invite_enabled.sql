-- ==========================================================================
-- profiles.gcal_invite_enabled — opt-in del cliente a ricevere inviti
-- Google Calendar per le proprie sessioni prenotate.
-- ==========================================================================
-- Feature: quando un cliente prenota una sessione, il coach scrive l'evento
-- sul SUO Google Calendar. Se questo flag è true sul profilo del cliente,
-- l'evento viene creato includendo il cliente come `attendees: [{email}]`
-- + `sendUpdates: 'all'`. Google notifica il cliente via email; cliccando
-- "Accetta" l'evento appare anche nel SUO Google Calendar.
--
-- ## Default: FALSE (opt-in esplicito)
-- Gli utenti esistenti NON ricevono email Google Calendar finché non
-- abilitano esplicitamente il toggle in /client/settings. Evita spam su
-- clienti che potrebbero non volere notifiche email da Google.
--
-- ## Privacy
-- L'email del cliente viene esposta nel campo `attendees` dell'evento
-- Google Calendar del coach. Il coach VEDE già l'email del cliente nella
-- piattaforma quindi nessun leak di nuovo. Altri attendee (es. se il
-- coach invita un secondo cliente per qualche motivo) NON sono possibili
-- — l'app inserisce sempre 1 solo attendee = il cliente della prenotazione.
-- ==========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gcal_invite_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.gcal_invite_enabled IS
  'Opt-in del cliente a ricevere inviti Google Calendar (attendee) per '
  'le sessioni prenotate. Quando true, sync-calendar include {email} '
  'nel campo attendees dell''evento + sendUpdates=all. Default false '
  'per non spammare utenti esistenti — il cliente deve abilitarlo '
  'esplicitamente in /client/settings.';
