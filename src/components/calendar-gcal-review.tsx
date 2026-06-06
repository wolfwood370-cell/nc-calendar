// ----------------------------------------------------------------------------
// CalendarGcalReview — pannello di riconciliazione bidirezionale Google <-> app.
// ----------------------------------------------------------------------------
// SOLA LETTURA: legge gli eventi del Google Calendar condiviso (server fn
// gcalListEventsForReview) e li confronta con i booking gia' caricati nella
// pagina /trainer/calendar. Mostra due liste:
//
//   1. "Su Google, non in piattaforma" — eventi creati direttamente su Google
//      Calendar che non hanno un booking corrispondente. Vanno visti/importati.
//   2. "In piattaforma, non su Google" — sessioni prenotate nell'app che non
//      hanno (piu') un evento Google corrispondente. Vanno riviste.
//
// Nessuna scrittura sul DB, nessuna migration: e' un confronto a video. Il
// matching e' per `bookings.google_event_id` == `googleEvent.id` -> niente
// doppioni. Le azioni di import/archiviazione persistenti sono una fase 2
// (richiedono scritture DB) e verranno aggiunte quando servira'.
// ----------------------------------------------------------------------------
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CalendarPlus, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gcalListEventsForReview } from "@/lib/gcal.functions";
import type { BookingRow, ProfileRow, EventTypeRow } from "@/lib/queries";
import { isAllDayEvent } from "@/components/mobile-calendar-agenda";
import { cn } from "@/lib/utils";

interface Props {
  coachId?: string;
  bookings: BookingRow[];
  clientsMap: Map<string, ProfileRow>;
  eventTypesMap: Map<string, EventTypeRow>;
}

function fmtDateTime(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtIso(iso: string): string {
  const ms = Date.parse(iso);
  return fmtDateTime(Number.isFinite(ms) ? ms : null);
}

export function CalendarGcalReview({ coachId, bookings, clientsMap, eventTypesMap }: Props) {
  const [open, setOpen] = useState(false);

  const reviewQ = useQuery({
    queryKey: ["gcal-review", coachId],
    enabled: !!coachId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await gcalListEventsForReview({ data: {} });
      if (!r.ok) throw new Error(r.error);
      return r.events;
    },
  });

  const { googleOnly, platformOnly } = useMemo(() => {
    const events = reviewQ.data ?? [];
    // Set degli id Google referenziati dai booking dell'app.
    const bookedGoogleIds = new Set(
      bookings.map((b) => b.google_event_id).filter(Boolean) as string[],
    );
    // Eventi su Google senza booking corrispondente.
    const gOnly = events.filter((e) => !bookedGoogleIds.has(e.id));

    // Booking "vivi" (scheduled, non cancellati) DENTRO la stessa finestra letta
    // da Google, che non hanno un evento Google corrispondente. Il bound
    // superiore (~+89g) evita falsi positivi su sessioni oltre la finestra
    // Google (+90g lato server): senza, un booking a +120g — il cui evento
    // Google non e' stato letto — risulterebbe erroneamente "non su Google".
    const liveGoogleIds = new Set(events.map((e) => e.id));
    const now = Date.now();
    const lowerMs = now - 24 * 60 * 60_000; // includi le ultime 24h
    const upperMs = now + 89 * 24 * 60 * 60_000; // appena dentro la finestra Google (+90g)
    const pOnly = bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      if (b.deleted_at) return false;
      // Promemoria interni (decisione utente 2026-06-06): gli eventi "tutto il
      // giorno" (compleanni, promemoria Stripe, fine percorso) e i blocchi
      // personali restano SOLO nell'app -> non vanno su Google e non sono
      // "errori da rivedere". Li escludiamo dalla lista.
      if (isAllDayEvent(b) || b.is_personal) return false;
      const ms = Date.parse(b.scheduled_at);
      if (!Number.isFinite(ms) || ms < lowerMs || ms > upperMs) return false;
      // manca del tutto l'evento Google, oppure l'id non e' tra quelli vivi.
      return !b.google_event_id || !liveGoogleIds.has(b.google_event_id);
    });
    return { googleOnly: gOnly, platformOnly: pOnly };
  }, [reviewQ.data, bookings]);

  const total = googleOnly.length + platformOnly.length;
  const loading = reviewQ.isLoading;
  const errored = reviewQ.isError;

  function bookingLabel(b: BookingRow): string {
    const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
    const base = b.title ?? et?.name ?? b.session_type ?? "Sessione";
    const isOwn = b.is_personal || (b.client_id && b.client_id === b.coach_id);
    const clientName = !isOwn && b.client_id ? clientsMap.get(b.client_id)?.full_name : null;
    return clientName ? `${base} — ${clientName}` : base;
  }

  // Stato "tutto ok": non mostriamo nulla di ingombrante.
  const allSynced = !loading && !errored && total === 0;

  return (
    <div className="mb-4 rounded-2xl border border-surface-container bg-white shadow-soft-blue overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 font-medium text-sm">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Riconciliazione Google Calendar
          {loading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {!loading && !errored && (
            <span
              className={cn(
                "ml-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                total === 0 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
              )}
            >
              {total === 0 ? "tutto sincronizzato" : `${total} da rivedere`}
            </span>
          )}
          {errored && (
            <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              errore lettura Google
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            reviewQ.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </button>

      {open && (
        <div className="border-t border-surface-container px-4 py-3 space-y-4 text-sm">
          {errored && (
            <p className="text-red-600">
              Impossibile leggere il Google Calendar. Riprova col tasto di refresh qui sopra.
            </p>
          )}
          {allSynced && (
            <p className="text-emerald-700">
              ✓ Tutti gli eventi sono allineati tra app e Google Calendar.
            </p>
          )}

          {/* Gruppo 1: su Google, non in piattaforma */}
          {googleOnly.length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 font-semibold text-blue-700 mb-2">
                <CalendarPlus className="h-4 w-4" />
                Su Google, non in piattaforma ({googleOnly.length})
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Eventi creati direttamente su Google Calendar. Non risultano come
                sessioni nell'app NC Calendar.
              </p>
              <ul className="space-y-1">
                {googleOnly.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-blue-50/60 px-3 py-2"
                  >
                    <span className="truncate">{e.summary || "(senza titolo)"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDateTime(e.startMs)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Gruppo 2: in piattaforma, non su Google */}
          {platformOnly.length > 0 && (
            <div>
              <h4 className="flex items-center gap-2 font-semibold text-amber-700 mb-2">
                <AlertTriangle className="h-4 w-4" />
                In piattaforma, non su Google ({platformOnly.length})
              </h4>
              <p className="text-xs text-muted-foreground mb-2">
                Sessioni prenotate nell'app senza un evento Google corrispondente.
                Da rivedere (potrebbero essere state cancellate su Google, o non
                ancora sincronizzate).
              </p>
              <ul className="space-y-1">
                {platformOnly.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-amber-50/60 px-3 py-2"
                  >
                    <span className="truncate">{bookingLabel(b)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtIso(b.scheduled_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
