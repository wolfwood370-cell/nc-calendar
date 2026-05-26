// ----------------------------------------------------------------------------
// CalendarManageSheet — Google Calendar connection management drawer
// ----------------------------------------------------------------------------
// Extracted from trainer.integrations.tsx. Owns three coach-facing
// actions:
//   - Manual sync (Sincronizza ora) → invokes sync-calendar edge function
//   - Orphan import (client-side recovery, bypasses validate_booking_block_
//     allocation trigger by inserting with block_id=NULL)
//   - Diagnostic sync (debug mode, dumps per-event tracing into a textarea)
// + the disconnect flow (parent owns the actual token-clearing handler).
// ----------------------------------------------------------------------------

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Calendar, Loader2, RefreshCw, ShieldCheck, Mail, Clock, LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import {
  syncCalendarAwait,
  clearAutoSyncThrottle,
  markAutoSyncDone,
} from "@/lib/sync-calendar";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface CalendarManageSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  coachId: string | null;
  connectedEmail: string | null;
  lastSyncAt: Date | null;
  onDisconnect: () => void;
}

function formatRelativeIt(d: Date | null): string {
  if (!d) return "mai";
  const diffMin = Math.round((Date.now() - d.getTime()) / 60_000);
  if (diffMin < 1) return "ora";
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h fa`;
  const diffD = Math.round(diffH / 24);
  return `${diffD} g fa`;
}

// Match logic mirroring the edge function's matchEvent (priority 1: email
// attendee == client email; priority 2: "nome cognome" substring in
// summary/description). Used by handleImportOrphans below for client-side
// import that bypasses the broken server flow.
function matchClientFromEvent(
  summary: string,
  description: string,
  attendees: Array<{ email?: string }>,
  clients: Array<{ id: string; full_name: string | null; email: string | null }>,
  coachEmail: string | null,
): { id: string } | null {
  const lower = `${summary} ${description}`.toLowerCase();
  const lowerCoach = (coachEmail ?? "").toLowerCase();
  const emails = new Set(
    attendees.map((a) => (a.email ?? "").toLowerCase()).filter((e) => e && e !== lowerCoach),
  );
  for (const c of clients) {
    const ce = (c.email ?? "").toLowerCase();
    if (ce && ce !== lowerCoach && emails.has(ce)) return { id: c.id };
  }
  for (const c of clients) {
    const fn = (c.full_name ?? "").trim();
    if (!fn) continue;
    const parts = fn.split(/\s+/);
    const firstRaw = parts[0];
    if (!firstRaw || parts.length < 2) continue;
    const first = firstRaw.toLowerCase();
    const last = parts.slice(1).join(" ").toLowerCase();
    if (!first || !last) continue;
    if (lower.includes(`${first} ${last}`) || lower.includes(`${last} ${first}`))
      return { id: c.id };
  }
  return null;
}

export function CalendarManageSheet({
  open,
  onOpenChange,
  coachId,
  connectedEmail,
  lastSyncAt,
  onDisconnect,
}: CalendarManageSheetProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDebugging, setIsDebugging] = useState(false);
  const [debugOutput, setDebugOutput] = useState<string | null>(null);
  const [isImportingOrphans, setIsImportingOrphans] = useState(false);
  const qc = useQueryClient();

  // Client-side recovery for bookings rejected by the edge function due
  // to the validate_booking_block_allocation trigger (alloc full →
  // INSERT raises P0001 → counter `imported` never increments).
  //
  // We replicate the edge function's matchEvent logic but INSERT with
  // block_id=NULL, which skips the trigger. The coach sees the events
  // in /trainer/calendar as "out of quota" rows they can later promote
  // by increasing the allocation or marking is_personal.
  //
  // Idempotent: skips events already in DB (by google_event_id).
  const handleImportOrphans = async () => {
    if (!coachId) return;
    setIsImportingOrphans(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const providerToken = sessionData?.session?.provider_token;
      if (!providerToken) {
        toast.error("Token Google scaduto", {
          description: "Disconnetti e ricollega Google, poi riprova subito.",
        });
        return;
      }

      const coachEmail = sessionData?.session?.user?.email ?? null;

      // Fetch clienti del coach (per match cliente da attendees / nome)
      const { data: clients, error: clientsErr } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("coach_id", coachId)
        .is("deleted_at", null);
      if (clientsErr) throw clientsErr;

      // Fetch google_event_id già presenti (per dedup)
      const { data: existingBookings, error: existingErr } = await supabase
        .from("bookings")
        .select("google_event_id")
        .eq("coach_id", coachId)
        .not("google_event_id", "is", null);
      if (existingErr) throw existingErr;
      const existingIds = new Set(
        (existingBookings ?? [])
          .map((b) => b.google_event_id as string | null)
          .filter((id): id is string => !!id),
      );

      // Fetch tutti gli eventi Google nel range (1 Jan anno corrente → +2 anni)
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const twoYearsAhead = new Date();
      twoYearsAhead.setFullYear(twoYearsAhead.getFullYear() + 2);
      type GcalEvent = {
        id?: string;
        summary?: string;
        description?: string;
        status?: string;
        start?: { dateTime?: string; date?: string };
        attendees?: Array<{ email?: string }>;
      };
      const allItems: GcalEvent[] = [];
      let pageToken = "";
      do {
        const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
        url.searchParams.set("timeMin", yearStart);
        url.searchParams.set("timeMax", twoYearsAhead.toISOString());
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "250");
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const r = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${providerToken}` },
        });
        if (!r.ok) {
          throw new Error(`Google API: ${r.status} ${await r.text().catch(() => "")}`);
        }
        const data = (await r.json()) as { items?: GcalEvent[]; nextPageToken?: string };
        allItems.push(...(data.items ?? []));
        pageToken = data.nextPageToken ?? "";
      } while (pageToken);

      // Filtra orfani: not cancelled, not in DB, valid start
      const orphans = allItems.filter((ev) => {
        if (!ev.id) return false;
        if (existingIds.has(ev.id)) return false;
        if (ev.status === "cancelled") return false;
        const s = ev.start?.dateTime ?? ev.start?.date;
        return !!s;
      });

      // INSERT one by one (no batch to keep error attribution clean)
      const now = Date.now();
      let inserted = 0;
      let failed = 0;
      for (const ev of orphans) {
        const summary = ev.summary ?? "Evento";
        const description = ev.description ?? "";
        const attendees = ev.attendees ?? [];
        const start = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
        if (!start) continue;

        // Importa SEMPRE come orfano non assegnato (client_id: null) per
        // bypassare il trigger validate_booking_extra_credits che richiede
        // event_type_id non-null quando client_id è settato. Il match
        // automatico via matchClientFromEvent causava errori P0001
        // "Credito esaurito: nessun tipo sessione specificato" su tutti
        // gli eventi dove un cliente veniva trovato negli attendees.
        // Il coach assegnerà i client manualmente dalla pagina /trainer/
        // calendar (badge giallo "Assegna" sugli orfani).
        //
        // Lasciato matchClientFromEvent + matched importati per chiarezza
        // della scelta — quando il trigger sarà rilassato o esisterà un
        // event_type default per il coach, basta ripristinare il match
        // attivo cambiando client_id: matched?.id ?? null.
        const _matched = matchClientFromEvent(
          summary,
          description,
          attendees,
          clients ?? [],
          coachEmail,
        );
        void _matched;
        const status = new Date(start).getTime() < now ? "completed" : "scheduled";

        // end_at: required NOT NULL column (added by Lovable migration).
        // A trigger recomputes the value from duration_min when missing,
        // but we still need to satisfy the NOT NULL — set to start+60min
        // as placeholder; the trigger will overwrite if needed.
        const endAt = new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
        const { error: insErr } = await supabase.from("bookings").insert({
          coach_id: coachId,
          client_id: null, // ← always orphan; manual assignment via calendar UI
          scheduled_at: start,
          end_at: endAt,
          session_type: "PT Session",
          event_type_id: null,
          status,
          block_id: null, // ← bypassa trigger validate_booking_block_allocation
          notes: `Importato da Google Calendar (orfano): ${summary}`,
          title: summary,
          google_event_id: ev.id as string,
        });
        if (insErr) {
          console.error("Import orphan failed", ev.id, insErr);
          failed++;
        } else {
          inserted++;
        }
      }

      qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
      qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });

      if (inserted === 0 && failed === 0) {
        toast.info("Nessun evento orfano trovato. Tutto già sincronizzato.");
      } else {
        toast.success(`Importati ${inserted} eventi orfani`, {
          description:
            failed > 0
              ? `${failed} non importati (vedi console). Causa probabile: RLS o trigger.`
              : "Visibili ora nel calendario. Senza credito scalato (block_id=null).",
        });
      }
    } catch (e) {
      console.error("handleImportOrphans error", e);
      toast.error("Importazione orfani fallita", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIsImportingOrphans(false);
    }
  };

  const handleSyncNow = async () => {
    if (!coachId) return;
    setIsSyncing(true);
    // P1 (sync throttle): manual button always wins. Clear the gate
    // first so the next auto-sync cycle doesn't immediately skip on
    // top of our work, then stamp markAutoSyncDone() once the call
    // succeeds — the 10-minute window restarts from now.
    clearAutoSyncThrottle();
    try {
      // "Sincronizza ora" sweeps from 1 January of the current year to
      // +2 years out. import_history is idempotent: events with a known
      // google_event_id are detected as `existing` and only get their
      // metadata refreshed — no duplicate row is created. Brand-new
      // Google events become fresh bookings. Backdated events created
      // earlier in the year (e.g. a BIA logged retroactively in April)
      // get picked up on the very next click of this button.
      const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const twoYearsAhead = new Date();
      twoYearsAhead.setFullYear(twoYearsAhead.getFullYear() + 2);

      const { data, error } = await syncCalendarAwait({
        action: "import_history",
        coachId,
        rangeStartISO: yearStart,
        rangeEndISO: twoYearsAhead.toISOString(),
      });
      if (error) throw error;
      const result = data as {
        ok?: boolean;
        imported?: number;
        updated?: number;
        matched?: number;
        creditsBooked?: number;
        skipped?: boolean;
        error?: string;
      } | null;
      if (result?.error) {
        toast.error("Sincronizzazione non riuscita", { description: result.error });
      } else if (result?.skipped) {
        toast.info("Sincronizzazione saltata", {
          description: "Connetti Google Calendar per sincronizzare.",
        });
      } else {
        const parts: string[] = [];
        if (result?.imported) parts.push(`${result.imported} nuovi`);
        if (result?.updated) parts.push(`${result.updated} aggiornati`);
        if (result?.creditsBooked) parts.push(`${result.creditsBooked} crediti scalati`);
        toast.success(
          parts.length > 0
            ? `Sincronizzazione completata: ${parts.join(", ")}.`
            : "Sincronizzazione completata. Nessun nuovo evento.",
        );
        // Refresh the bookings caches so the calendar/dashboard pick up
        // newly imported rows without a manual page reload.
        qc.invalidateQueries({ queryKey: queryKeys.bookings.coach(coachId) });
        qc.invalidateQueries({ queryKey: queryKeys.bookings.unassignedAll(coachId) });
        markAutoSyncDone();
      }
    } catch (err) {
      console.error("sync-calendar import_history failed", err);
      toast.error("Sincronizzazione non riuscita", {
        description: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-surface border-l border-surface-variant p-0 overflow-y-auto"
      >
        <div className="p-6 space-y-6">
          <SheetHeader className="space-y-1">
            <SheetTitle className="font-display text-2xl text-aura-primary">
              Gestisci Google Calendar
            </SheetTitle>
            <SheetDescription className="text-outline">
              Controlla la connessione e la sincronizzazione del tuo calendario.
            </SheetDescription>
          </SheetHeader>

          {/* Status & Account */}
          <div className="rounded-[24px] bg-white p-5 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-[#4285F415] grid place-items-center">
                <Calendar className="size-5" style={{ color: "#4285F4" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Mail className="size-3.5 text-outline" />
                  <p className="text-sm font-medium text-aura-primary truncate">
                    {connectedEmail ?? "—"}
                  </p>
                </div>
                <p className="text-xs text-outline mt-0.5 flex items-center gap-1">
                  <Clock className="size-3" /> Ultima sincronizzazione:{" "}
                  {formatRelativeIt(lastSyncAt)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs font-medium">
                <ShieldCheck className="size-3" /> Verificato
              </span>
            </div>
          </div>

          {/* Manual Sync */}
          <div className="rounded-[24px] bg-white p-5 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] space-y-4">
            <div>
              <h3 className="font-display text-base font-semibold text-aura-primary">
                Sincronizzazione manuale
              </h3>
              <p className="text-xs text-outline mt-1">
                Avvia subito un controllo per importare nuovi eventi.
              </p>
            </div>
            <Button
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="w-full rounded-full bg-aura-primary hover:bg-on-primary-fixed text-white h-11"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" /> Sincronizzazione in corso...
                </>
              ) : (
                <>
                  <RefreshCw className="size-4 mr-2" /> Sincronizza ora
                </>
              )}
            </Button>

            {/* Recovery button: imports Google events that the edge
                function couldn't insert (typically because the booking
                trigger validate_booking_block_allocation rejected the
                INSERT when the client's allocation was already full).
                Bookings are inserted with block_id=null so they bypass
                the trigger; the coach sees them as "out of quota" rows. */}
            <Button
              onClick={handleImportOrphans}
              disabled={isImportingOrphans || isSyncing || isDebugging}
              variant="outline"
              className="w-full rounded-full border-aura-primary text-aura-primary h-11"
            >
              {isImportingOrphans ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" /> Importazione orfani...
                </>
              ) : (
                "Importa eventi orfani da Google"
              )}
            </Button>

            {/* Diagnostic button — invokes the same import_history action
                but with debug=true, then dumps the full per-event tracing
                into a textarea so the coach can identify why specific
                events aren't being imported (missing match, paging, etc). */}
            <Button
              onClick={async () => {
                if (!coachId) return;
                setIsDebugging(true);
                setDebugOutput("Sincronizzazione diagnostica in corso...");
                try {
                  clearAutoSyncThrottle();
                  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
                  const twoYearsAhead = new Date();
                  twoYearsAhead.setFullYear(twoYearsAhead.getFullYear() + 2);
                  const { data, error } = await syncCalendarAwait({
                    action: "import_history",
                    coachId,
                    rangeStartISO: yearStart,
                    rangeEndISO: twoYearsAhead.toISOString(),
                    debug: true,
                  });
                  if (error) {
                    setDebugOutput(
                      `ERRORE: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
                    );
                  } else {
                    setDebugOutput(JSON.stringify(data, null, 2));
                  }
                } catch (e) {
                  setDebugOutput(`ERRORE: ${e instanceof Error ? e.message : String(e)}`);
                } finally {
                  setIsDebugging(false);
                }
              }}
              disabled={isDebugging || isSyncing}
              variant="outline"
              className="w-full rounded-full border-outline-variant text-on-surface-variant h-10"
            >
              {isDebugging ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" /> Diagnostica in corso...
                </>
              ) : (
                "Diagnostica sync (per debug)"
              )}
            </Button>
            {debugOutput && (
              <div className="space-y-2">
                <textarea
                  readOnly
                  value={debugOutput}
                  className="w-full h-64 text-[10px] font-mono p-2 rounded-xl border border-outline-variant bg-surface-container-low"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(debugOutput);
                    toast.success("Output copiato negli appunti");
                  }}
                  className="text-xs"
                >
                  Copia output
                </Button>
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="rounded-[24px] border border-red-200 bg-red-50/40 p-5 space-y-3">
            <div>
              <h3 className="font-display text-base font-semibold text-red-700">Zona pericolosa</h3>
              <p className="text-xs text-red-600/80 mt-1">
                La disconnessione interromperà tutte le sincronizzazioni automatiche.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full rounded-full border-red-300 text-red-700 hover:bg-red-100 hover:text-red-800"
                >
                  <LogOut className="size-4 mr-2" /> Disconnetti account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-[24px]">
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnettere Google Calendar?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sei sicuro di voler disconnettere Google Calendar? La sincronizzazione delle
                    sessioni verrà interrotta.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDisconnect}
                    className="rounded-full bg-red-600 hover:bg-red-700 text-white"
                  >
                    Disconnetti
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
