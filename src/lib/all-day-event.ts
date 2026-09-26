// ----------------------------------------------------------------------------
// Eventi giornalieri di Google Calendar
// ----------------------------------------------------------------------------
// Spostato qui da mobile-calendar-agenda.tsx (passata 04), invariato: serve
// all'agenda del telefono, alla riconciliazione e agli helper del desktop.
//
// Heuristic detection for Google Calendar all-day events (birthdays,
// anniversaries, holidays). il connettore Lovable normalizza Google
// `start.date` (date-only, no time) to `"<yyyy-MM-dd>T00:00:00Z"`, so
// the `Z`-suffixed midnight pattern is the marker. A regular event
// scheduled at midnight Italy time would be saved as
// `"...T22:00:00+00:00"` after conversion, so the false-positive risk
// is low for the Italy-based business timezone the app is built for.
// ----------------------------------------------------------------------------

export function isAllDayEvent(b: { scheduled_at: string }): boolean {
  return /T00:00:00(?:\.000)?Z$/i.test(b.scheduled_at);
}
