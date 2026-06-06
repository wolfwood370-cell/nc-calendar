// ----------------------------------------------------------------------------
// CalendarGcalReview — pannello di riconciliazione bidirezionale Google <-> app.
// ----------------------------------------------------------------------------
// Legge il Google Calendar condiviso (server fn gcalListEventsForReview) e lo
// confronta con i booking gia' caricati in /trainer/calendar. Mostra due liste:
//
//   1. "Su Google, non in piattaforma" — eventi creati direttamente su Google
//      senza booking corrispondente. Ogni riga ha un pulsante "Importa" che apre
//      un dialogo (FASE 2): evento esterno (no crediti) oppure sessione cliente
//      (collegata a un cliente, SENZA scalare crediti). L'import imposta
//      google_event_id -> niente doppioni.
//   2. "In piattaforma, non su Google" — sessioni app senza evento Google ->
//      da rivedere. Gli eventi "tutto il giorno" / personali sono esclusi
//      (restano note interne dell'app, decisione utente 2026-06-06).
//
// Matching per `bookings.google_event_id` == `googleEvent.id`.
// ----------------------------------------------------------------------------
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CalendarPlus, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { gcalListEventsForReview, gcalImportEvent } from "@/lib/gcal.functions";
import { queryKeys } from "@/lib/query-keys";
import type { BookingRow, ProfileRow, EventTypeRow } from "@/lib/queries";
import { isAllDayEvent } from "@/components/mobile-calendar-agenda";
import { cn } from "@/lib/utils";

interface Props {
  coachId?: string;
  bookings: BookingRow[];
  clientsMap: Map<string, ProfileRow>;
  eventTypesMap: Map<string, EventTypeRow>;
}

type ReviewEvent = { id: string; summary: string; startMs: number | null; endMs: number | null };

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
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // ---- stato dialogo import ----
  const [importTarget, setImportTarget] = useState<ReviewEvent | null>(null);
  const [mode, setMode] = useState<"external" | "client">("external");
  const [clientId, setClientId] = useState<string>("");
  const [eventTypeId, setEventTypeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const clients = useMemo(() => Array.from(clientsMap.values()), [clientsMap]);
  const eventTypes = useMemo(() => Array.from(eventTypesMap.values()), [eventTypesMap]);

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
    const bookedGoogleIds = new Set(
      bookings.map((b) => b.google_event_id).filter(Boolean) as string[],
    );
    const gOnly = events.filter((e) => !bookedGoogleIds.has(e.id));

    const liveGoogleIds = new Set(events.map((e) => e.id));
    const now = Date.now();
    const lowerMs = now - 24 * 60 * 60_000;
    const upperMs = now + 89 * 24 * 60 * 60_000;
    const pOnly = bookings.filter((b) => {
      if (b.status === "cancelled") return false;
      if (b.deleted_at) return false;
      // Promemoria interni (decisione utente 2026-06-06): all-day + personali
      // restano solo nell'app -> non sono "errori da rivedere".
      if (isAllDayEvent(b) || b.is_personal) return false;
      const ms = Date.parse(b.scheduled_at);
      if (!Number.isFinite(ms) || ms < lowerMs || ms > upperMs) return false;
      return !b.google_event_id || !liveGoogleIds.has(b.google_event_id);
    });
    return { googleOnly: gOnly, platformOnly: pOnly };
  }, [reviewQ.data, bookings]);

  const total = googleOnly.length + platformOnly.length;
  const loading = reviewQ.isLoading;
  const errored = reviewQ.isError;
  const allSynced = !loading && !errored && total === 0;

  function bookingLabel(b: BookingRow): string {
    const et = b.event_type_id ? eventTypesMap.get(b.event_type_id) : undefined;
    const base = b.title ?? et?.name ?? b.session_type ?? "Sessione";
    const isOwn = b.is_personal || (b.client_id && b.client_id === b.coach_id);
    const clientName = !isOwn && b.client_id ? clientsMap.get(b.client_id)?.full_name : null;
    return clientName ? `${base} — ${clientName}` : base;
  }

  function openImport(e: ReviewEvent) {
    setImportTarget(e);
    // Riconoscimento automatico dal titolo Google (es. "Test Funzionali +
    // Check Tecnico (Marco Golinelli)"): cerca il tipo sessione e il cliente
    // i cui nomi compaiono nel titolo. Preferiamo il match piu' LUNGO (es.
    // "PT-Pack" batte "PT"). Se trova un cliente -> modalita' "client".
    const s = (e.summary ?? "").toLowerCase();
    let etId = "";
    let bestEt = 0;
    for (const et of eventTypes) {
      const n = (et.name ?? "").toLowerCase().trim();
      if (n && s.includes(n) && n.length > bestEt) {
        etId = et.id;
        bestEt = n.length;
      }
    }
    let cId = "";
    let bestC = 0;
    for (const c of clients) {
      const n = (c.full_name ?? "").toLowerCase().trim();
      if (n && s.includes(n) && n.length > bestC) {
        cId = c.id;
        bestC = n.length;
      }
    }
    setMode(cId ? "client" : "external");
    setClientId(cId);
    setEventTypeId(etId);
  }

  async function confirmImport() {
    if (!importTarget) return;
    if (mode === "client" && !clientId) {
      toast.error("Seleziona un cliente.");
      return;
    }
    setSubmitting(true);
    try {
      const r = await gcalImportEvent({
        data: {
          googleEventId: importTarget.id,
          summary: importTarget.summary || undefined,
          startISO: new Date(importTarget.startMs ?? Date.now()).toISOString(),
          endISO: importTarget.endMs ? new Date(importTarget.endMs).toISOString() : undefined,
          mode,
          clientId: mode === "client" ? clientId : undefined,
          eventTypeId: mode === "client" && eventTypeId ? eventTypeId : undefined,
        },
      });
      if (!r.ok) {
        toast.error("Import non riuscito", { description: r.error });
        return;
      }
      toast.success(
        r.alreadyImported ? "Evento già presente in piattaforma" : "Evento importato",
      );
      setImportTarget(null);
      // Aggiorna calendario + pannello.
      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      qc.invalidateQueries({ queryKey: ["gcal-review", coachId] });
      reviewQ.refetch();
    } catch (e) {
      toast.error("Import non riuscito", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSubmitting(false);
    }
  }

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
                Eventi creati direttamente su Google Calendar. Premi "Importa" per
                aggiungerli all'app NC Calendar.
              </p>
              <ul className="space-y-1">
                {googleOnly.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-blue-50/60 px-3 py-2"
                  >
                    <span className="truncate">{e.summary || "(senza titolo)"}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">{fmtDateTime(e.startMs)}</span>
                      <Button size="sm" variant="outline" onClick={() => openImport(e)}>
                        Importa
                      </Button>
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

      {/* Dialogo import (FASE 2) */}
      <Dialog open={!!importTarget} onOpenChange={(o) => !o && setImportTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importa evento da Google</DialogTitle>
            <DialogDescription>
              {importTarget?.summary || "(senza titolo)"} · {fmtDateTime(importTarget?.startMs ?? null)}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "external" | "client")}>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="external" id="imp-external" className="mt-1" />
                <Label htmlFor="imp-external" className="font-normal cursor-pointer">
                  <span className="font-medium">Evento esterno / mio impegno</span>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Occupa lo slot nel calendario. Non collegato a un cliente, non
                    scala crediti.
                  </span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="client" id="imp-client" className="mt-1" />
                <Label htmlFor="imp-client" className="font-normal cursor-pointer">
                  <span className="font-medium">Sessione di un cliente</span>
                  <br />
                  <span className="text-xs text-muted-foreground">
                    Collegata a un cliente per lo storico. NON scala crediti
                    (gestiscili a parte se serve).
                  </span>
                </Label>
              </div>
            </RadioGroup>

            {mode === "client" && (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Cliente</Label>
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Scegli un cliente…" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.full_name ?? c.email ?? c.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Tipo sessione (opzionale)</Label>
                  <Select value={eventTypeId} onValueChange={setEventTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Predefinito (PT Session)" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventTypes.map((et) => (
                        <SelectItem key={et.id} value={et.id}>
                          {et.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportTarget(null)} disabled={submitting}>
              Annulla
            </Button>
            <Button onClick={confirmImport} disabled={submitting}>
              {submitting ? "Importo…" : "Importa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
