// ----------------------------------------------------------------------------
// Disponibilità sul telefono (passata 08)
// ----------------------------------------------------------------------------
// È la pagina di prima, spostata qui da src/routes/trainer.availability.tsx
// senza cambiarne l'aspetto dell'orario: il redesign vale da md in su
// (availability-desktop.tsx), e la route ne monta una sola.
// Passata 11 del lato cliente: le regole e i dati del desktop.
//   - Bozza, lettura e salvataggio sono quelli del desktop
//     (use-availability-draft.ts): la bozza nasce da una lettura fresca e non
//     dalla cache, segue le letture nuove finché non la modifichi (anche dopo
//     un «Ripristina» fatto dal computer), e una lettura fallita lo dice
//     invece di sembrare una settimana vuota.
//   - L'anteprima e le regole di prenotazione sono le card del desktop: la
//     stima usa la durata e il margine della tipologia, e le regole si leggono
//     e basta. Prima tre campi (margine, preavviso, orizzonte) si salvavano
//     in trainer_settings senza effetto, e con la lettura fallita ci si
//     scrivevano 15, 24 e 60.
//   - Con una modifica non salvata la pagina resta montata anche se la
//     finestra si allarga oltre md (onHoldChange), così la bozza non si perde
//     ruotando il telefono.
// ----------------------------------------------------------------------------

import { useEffect } from "react";
import { AlertCircle, Plus, Trash2, Copy, Loader2, Info, Save } from "lucide-react";
import { AvailabilityExceptionsCard } from "@/components/availability-exceptions-card";
import { AvailabilityPreviewCard, BookingRulesCard } from "@/components/availability-preview-card";
import { PageTitle } from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAvailabilityDraft } from "@/hooks/use-availability-draft";
import { HOURS } from "@/lib/availability-helpers";
import {
  WEEK_DAYS,
  copyDay,
  removeRange,
  toggleDay,
  updateRange,
  type Dow,
  type WeekDraft,
} from "@/lib/availability-week";
import { useAuth } from "@/lib/auth";
import { useCoachEventTypes } from "@/lib/queries";
import { toast } from "sonner";

/** «+» del telefono: una fascia 14:00-18:00, come prima. */
function addAfternoon(week: WeekDraft, dow: Dow): WeekDraft {
  const day = week[dow];
  return {
    ...week,
    [dow]: { active: true, ranges: [...day.ranges, { start: "14:00", end: "18:00" }] },
  };
}

/** Le fasce del giorno sugli altri giorni accesi, come prima. */
function copyToActive(week: WeekDraft, source: Dow): WeekDraft {
  const targets = WEEK_DAYS.map((d) => d.dow).filter((d) => d !== source && week[d].active);
  return copyDay(week, source, targets);
}

export function AvailabilityMobile({
  onHoldChange,
}: {
  /** true finché ci sono orari non salvati: la route tiene montato il telefono. */
  onHoldChange?: (hold: boolean) => void;
}) {
  const { user } = useAuth();
  const meId = user?.id;
  const draft = useAvailabilityDraft(meId);
  const { week, errors, withErrors, dirty, saving, readFailed } = draft;
  const typesQ = useCoachEventTypes(meId);

  useEffect(() => onHoldChange?.(dirty || saving), [dirty, saving, onHoldChange]);

  const copyToAll = (sourceDow: Dow) => {
    draft.edit((w) => copyToActive(w, sourceDow));
    toast.success("Orari copiati sui giorni attivi");
  };

  return (
    <div className="min-h-screen bg-surface -m-4 sm:-m-6 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <PageTitle>Disponibilità</PageTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Configura il tuo orario settimanale, le regole di prenotazione e le eccezioni.
            </p>
          </div>
          <Button
            onClick={() => void draft.save()}
            disabled={saving || !dirty || withErrors}
            className="rounded-full px-6 h-11 bg-reschedule text-white text-sm font-semibold hover:bg-reschedule/90"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <Save className="size-4 mr-2" />
            )}
            Salva modifiche
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          {/* LEFT: Weekly Schedule */}
          <div className="space-y-6">
            <div className="rounded-[24px] bg-blue-50/70 border border-blue-100 p-4 flex items-start gap-3">
              <Info className="size-5 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-900">Sincronizzato con Google Calendar</p>
                <p className="text-blue-700/80 mt-0.5">
                  Le tue disponibilità verranno automaticamente confrontate con gli eventi del tuo
                  calendario per evitare doppie prenotazioni.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-[32px] shadow-[0px_4px_20px_rgba(0,86,133,0.05)] p-6 sm:p-8">
              <h2 className="card-title mb-1">Orario settimanale</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Definisci gli intervalli in cui sei disponibile per le sessioni.
              </p>

              {!week && readFailed ? (
                <div className="flex flex-col items-start gap-3 py-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                    <AlertCircle className="size-4 text-danger-text" aria-hidden />
                    Non riesco a leggere l'orario settimanale.
                  </p>
                  <Button variant="outline" className="rounded-full" onClick={draft.retry}>
                    Riprova
                  </Button>
                </div>
              ) : !week ? (
                <div className="space-y-3" aria-busy="true">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-[24px]" />
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-surface-container-low">
                  {WEEK_DAYS.map((d, dayIdx) => {
                    const ds = week[d.dow];
                    return (
                      <div
                        key={d.dow}
                        className="py-4 flex flex-col sm:flex-row sm:items-start gap-4"
                      >
                        <div className="flex items-center gap-3 sm:w-40 shrink-0 pt-2">
                          <Switch
                            checked={ds.active}
                            disabled={saving}
                            onCheckedChange={(v) => draft.edit((w) => toggleDay(w, d.dow, v))}
                            aria-label={`Attiva ${d.label.toLowerCase()}`}
                            className="data-[state=checked]:bg-reschedule data-[state=unchecked]:bg-outline-variant"
                          />
                          <span
                            className={`font-medium ${ds.active ? "text-on-surface" : "text-outline-variant"}`}
                          >
                            {d.label}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          {!ds.active ? (
                            <p className="text-sm text-outline-variant italic pt-2">
                              Non disponibile
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {ds.ranges.map((b, idx) => (
                                <div key={idx} className="flex items-center gap-2 flex-wrap">
                                  <Select
                                    value={b.start}
                                    disabled={saving}
                                    onValueChange={(v) =>
                                      draft.edit((w) => updateRange(w, d.dow, idx, "start", v))
                                    }
                                  >
                                    <SelectTrigger
                                      aria-label={`${d.label}: orario di inizio`}
                                      aria-required="true"
                                      className="h-10 w-28 rounded-full bg-surface border-surface-variant px-3.5 gap-2 text-sm text-on-surface [&_svg]:size-3.5 [&_svg]:opacity-100 [&_svg]:text-outline"
                                    >
                                      <SelectValue placeholder="--:--" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {HOURS.map((h) => (
                                        <SelectItem key={h} value={h}>
                                          {h}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <span className="text-outline-variant">—</span>
                                  <Select
                                    value={b.end}
                                    disabled={saving}
                                    onValueChange={(v) =>
                                      draft.edit((w) => updateRange(w, d.dow, idx, "end", v))
                                    }
                                  >
                                    <SelectTrigger
                                      aria-label={`${d.label}: orario di fine`}
                                      aria-required="true"
                                      className="h-10 w-28 rounded-full bg-surface border-surface-variant px-3.5 gap-2 text-sm text-on-surface [&_svg]:size-3.5 [&_svg]:opacity-100 [&_svg]:text-outline"
                                    >
                                      <SelectValue placeholder="--:--" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {HOURS.map((h) => (
                                        <SelectItem key={h} value={h}>
                                          {h}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 rounded-full text-outline hover:text-error"
                                    disabled={saving}
                                    onClick={() => draft.edit((w) => removeRange(w, d.dow, idx))}
                                    aria-label="Rimuovi fascia"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                          {errors[d.dow] && (
                            <p role="alert" className="text-xs text-error pt-1 font-medium">
                              {errors[d.dow]}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 sm:pt-1">
                          {ds.active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-outline hover:bg-surface-container-low"
                              disabled={saving}
                              onClick={() => draft.edit((w) => addAfternoon(w, d.dow))}
                              aria-label="Aggiungi fascia"
                            >
                              <Plus className="size-4" />
                            </Button>
                          )}
                          {dayIdx === 0 && ds.active && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-outline hover:bg-surface-container-low"
                              disabled={saving}
                              onClick={() => copyToAll(d.dow)}
                              aria-label="Copia su tutti i giorni"
                              title="Copia su tutti i giorni attivi"
                            >
                              <Copy className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Anteprima + booking rules + exceptions */}
          <div className="space-y-6">
            {/* Anteprima e regole: le card del desktop (passata 11 del lato
                cliente). La stima usa durata e margine della tipologia; le
                regole si leggono e basta. */}
            <AvailabilityPreviewCard
              week={week}
              weekFailed={readFailed}
              types={typesQ.data}
              typesFailed={typesQ.isError && !typesQ.data}
            />
            <BookingRulesCard />

            <AvailabilityExceptionsCard coachId={meId} />
          </div>
        </div>
      </div>
    </div>
  );
}
