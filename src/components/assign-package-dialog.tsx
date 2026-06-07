// ----------------------------------------------------------------------------
// AssignPackageDialog — assegna un pacchetto/percorso a un cliente ESISTENTE
// ----------------------------------------------------------------------------
// Risolve il "buco architetturale": finora la configurazione del percorso
// (blocchi/crediti) avveniva SOLO al momento della creazione col wizard
// CreateClientDialog. I clienti creati via "Invita Cliente" restavano allo
// stato grezzo (path_type='fixed', 0 blocchi, path_start_date NULL) — vedi
// Nicolò Castello, Alessandrelli, Boarato.
//
// Questo dialog replica la parte di "configurazione percorso" del wizard
// (step 2-3) ma opera su un client_id già esistente: NON crea l'utente,
// si limita a creare blocchi+allocations (Percorso/Abbonamento) oppure
// extra_credits (Cliente Libero / PT Pack) e a impostare i metadati del
// profilo (incl. path_start_date, la cui mancanza era la causa-radice).
//
// MODELLO (deciso 2026-06-07): "Free Session" e "PT Pack (3 sessioni)" sono
// entrambi modellati come Cliente Libero (path_type='free') + extra_credits,
// SENZA blocchi né percorso a settimane. Il PT Pack è solo un preset che
// imposta 3 crediti PT.
//
// SICUREZZA v1: se il cliente ha GIÀ un pacchetto attivo (blocchi o crediti),
// il dialog mostra un avviso e NON sovrascrive. Il "cambia/reset" con
// cancellazione dati (più rischioso) verrà aggiunto in seguito.
// ----------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { Sparkles, Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import type { SessionType } from "@/lib/mock-data";
import {
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

interface RuleDraft {
  id: string;
  eventTypeId: string;
  quantityPerBlock: number;
  startBlock: number;
  endBlock: number;
}

export interface AssignPackagePayload {
  pathType: "fixed" | "recurring" | "free";
  totalBlocks: number;
  packLabel: string | null;
  autoRenew: boolean;
  rules: Array<{
    eventTypeId: string;
    sessionType: SessionType;
    quantityPerBlock: number;
    startBlock: number;
    endBlock: number;
  }>;
  freeSessions?: number;
  freeEventTypeId?: string;
}

export interface AssignPackageEventType {
  id: string;
  name: string;
  base_type: SessionType;
}

const DURATION_PRESETS: Array<{ value: string; label: string; months: number | null }> = [
  { value: "1", label: "1 Mese", months: 1 },
  { value: "3", label: "3 Mesi", months: 3 },
  { value: "6", label: "6 Mesi", months: 6 },
  { value: "12", label: "12 Mesi", months: 12 },
  { value: "custom", label: "Manuale (numero blocchi)", months: null },
];

export function AssignPackageDialog({
  open,
  clientName,
  eventTypes,
  hasExistingPackage,
  onAssign,
}: {
  open: boolean;
  clientName: string;
  eventTypes: AssignPackageEventType[];
  /** true se il cliente ha già blocchi attivi o crediti extra: in v1 blocchiamo
   *  la riassegnazione per non sovrascrivere/duplicare dati. */
  hasExistingPackage: boolean;
  onAssign: (d: AssignPackagePayload) => Promise<void>;
}) {
  const [pathType, setPathType] = useState<"fixed" | "recurring" | "free">("free");
  const [durationPreset, setDurationPreset] = useState<string>("3");
  const [customMonths, setCustomMonths] = useState<number>(3);
  const [packLabel, setPackLabel] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [freeSessions, setFreeSessions] = useState<number>(1);
  const [freeEventTypeId, setFreeEventTypeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset lo stato quando il dialog si chiude (il subtree resta montato).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      setPathType("free");
      setDurationPreset("3");
      setCustomMonths(3);
      setPackLabel(null);
      setRules([]);
      setFreeSessions(1);
      setFreeEventTypeId("");
      setSubmitting(false);
    }
    // Quando si apre: default freeEventTypeId al primo PT disponibile.
    if (!wasOpenRef.current && open && !freeEventTypeId) {
      const pt = eventTypes.find((e) => e.base_type === "PT Session") ?? eventTypes[0];
      if (pt) setFreeEventTypeId(pt.id);
    }
    wasOpenRef.current = open;
  }, [open, eventTypes, freeEventTypeId]);

  const totalBlocks =
    pathType === "recurring"
      ? 1
      : durationPreset === "custom"
        ? Math.max(1, customMonths)
        : (DURATION_PRESETS.find((d) => d.value === durationPreset)?.months ?? 1);

  // PT Pack = Cliente Libero + 3 crediti PT (modello leggero deciso 2026-06-07).
  function applyPtPackPreset() {
    const pt = eventTypes.find((e) => e.base_type === "PT Session") ?? eventTypes[0];
    if (!pt) {
      toast.error("Crea prima una tipologia di sessione PT.");
      return;
    }
    setPathType("free");
    setPackLabel("Pacchetto 3 sessioni");
    setFreeEventTypeId(pt.id);
    setFreeSessions(3);
    toast.success("Preset PT Pack applicato (3 crediti PT)");
  }

  function addRule() {
    setRules((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        eventTypeId: eventTypes[0]?.id ?? "",
        quantityPerBlock: 4,
        startBlock: 1,
        endBlock: totalBlocks,
      },
    ]);
  }

  function updateRule(id: string, patch: Partial<RuleDraft>) {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleSubmit() {
    if (pathType === "free") {
      if (!freeEventTypeId) {
        toast.error("Seleziona una tipologia di sessione.");
        return;
      }
      if (freeSessions < 1) {
        toast.error("Il numero di sessioni deve essere ≥ 1.");
        return;
      }
    } else {
      if (rules.length === 0) {
        toast.error("Aggiungi almeno una regola di assegnazione.");
        return;
      }
      for (const r of rules) {
        if (!r.eventTypeId) {
          toast.error("Seleziona una tipologia per ogni regola.");
          return;
        }
        if (r.quantityPerBlock < 1) {
          toast.error("La quantità per blocco deve essere ≥ 1.");
          return;
        }
        if (r.startBlock < 1 || r.endBlock < r.startBlock || r.endBlock > totalBlocks) {
          toast.error(`Intervalli blocco non validi (1–${totalBlocks}).`);
          return;
        }
      }
    }
    setSubmitting(true);
    try {
      const expandedRules =
        pathType === "free"
          ? []
          : rules.map((r) => {
              const et = eventTypes.find((e) => e.id === r.eventTypeId)!;
              return {
                eventTypeId: r.eventTypeId,
                sessionType: et.base_type as SessionType,
                quantityPerBlock: r.quantityPerBlock,
                startBlock: r.startBlock,
                endBlock: r.endBlock,
              };
            });
      await onAssign({
        pathType,
        totalBlocks: pathType === "free" ? 0 : totalBlocks,
        packLabel: pathType === "free" ? (packLabel ?? "Cliente Libero") : packLabel,
        autoRenew: pathType === "recurring",
        rules: expandedRules,
        freeSessions: pathType === "free" ? freeSessions : undefined,
        freeEventTypeId: pathType === "free" ? freeEventTypeId : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Assegna pacchetto — {clientName}</DialogTitle>
      </DialogHeader>

      {hasExistingPackage ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex gap-3">
          <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Questo cliente ha già un pacchetto attivo.</p>
            <p className="mt-1">
              Per evitare di sovrascrivere o duplicare dati, l'assegnazione è disponibile solo per
              clienti senza percorso/crediti. La funzione "cambia pacchetto" (con azzeramento del
              precedente) verrà aggiunta più avanti.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {eventTypes.length === 0 && (
            <p className="text-xs text-destructive">
              Crea prima almeno una tipologia di sessione (Event Type).
            </p>
          )}

          <div className="space-y-2">
            <Label>Tipo di pacchetto</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPathType("free");
                  setPackLabel(null);
                }}
                className={`text-left rounded-[24px] border-2 p-3 transition-colors ${
                  pathType === "free"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Cliente Libero</div>
                <div className="text-xs text-muted-foreground">
                  Free Session: crediti singoli, nessun percorso.
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPathType("fixed");
                  setPackLabel(null);
                }}
                className={`text-left rounded-[24px] border-2 p-3 transition-colors ${
                  pathType === "fixed"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Percorso Fisso</div>
                <div className="text-xs text-muted-foreground">
                  Blocchi sequenziali da ~30 giorni.
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPathType("recurring");
                  setPackLabel(null);
                }}
                className={`text-left rounded-[24px] border-2 p-3 transition-colors ${
                  pathType === "recurring"
                    ? "border-primary bg-primary/10"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Abbonamento Mensile</div>
                <div className="text-xs text-muted-foreground">
                  Ricorrente: nuovo blocco ogni 30 giorni.
                </div>
              </button>
            </div>
          </div>

          {/* Preset PT Pack (= Cliente Libero + 3 crediti PT) */}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={applyPtPackPreset}>
              <Sparkles className="size-4" /> PT Pack (3 sessioni)
            </Button>
            {packLabel && (
              <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-semibold">
                {packLabel}
              </span>
            )}
          </div>

          {/* Cliente Libero / PT Pack → crediti extra */}
          {pathType === "free" && (
            <div className="rounded-[24px] border bg-card p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-sm">Crediti da assegnare</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Verranno accreditati come crediti extra (validità 1 anno). Il cliente li usa quando
                  vuole, senza percorso a settimane.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tipologia di sessione</Label>
                  <Select value={freeEventTypeId} onValueChange={setFreeEventTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona" />
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
                <div className="space-y-1">
                  <Label className="text-xs">Numero di crediti</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={freeSessions}
                    onChange={(e) => setFreeSessions(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Percorso Fisso → durata */}
          {pathType === "fixed" && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Durata percorso</Label>
                <Select value={durationPreset} onValueChange={setDurationPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_PRESETS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {durationPreset === "custom" && (
                <div className="space-y-2">
                  <Label>Numero di blocchi</Label>
                  <Input
                    type="number"
                    min={1}
                    max={36}
                    value={customMonths}
                    onChange={(e) => setCustomMonths(Math.max(1, Number(e.target.value) || 1))}
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {totalBlocks} blocchi sequenziali (~30 giorni ciascuno). La data d'inizio sarà oggi
                (modificabile poi dalla scheda).
              </p>
            </div>
          )}

          {pathType === "recurring" && (
            <p className="text-xs text-muted-foreground">
              1 blocco mensile con rinnovo automatico ogni 30 giorni. Data d'inizio: oggi.
            </p>
          )}

          {/* Regole crediti per Percorso/Abbonamento */}
          {pathType !== "free" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Crediti per blocco (su {totalBlocks} blocchi).
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={addRule}
                  disabled={eventTypes.length === 0}
                >
                  <Plus className="size-4" /> Aggiungi
                </Button>
              </div>
              <div className="space-y-2 max-h-[36vh] overflow-y-auto pr-1">
                {rules.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nessuna regola. Clicca "Aggiungi" per definire i crediti.
                  </div>
                ) : (
                  rules.map((r) => (
                    <div key={r.id} className="rounded-2xl border p-3">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-12 sm:col-span-5 space-y-1">
                          <Label className="text-xs">Tipologia</Label>
                          <Select
                            value={r.eventTypeId}
                            onValueChange={(v) => updateRule(r.id, { eventTypeId: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleziona" />
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
                        <div className="col-span-4 sm:col-span-2 space-y-1">
                          <Label className="text-xs">Q.tà / blocco</Label>
                          <Input
                            type="number"
                            min={1}
                            value={r.quantityPerBlock}
                            onChange={(e) =>
                              updateRule(r.id, {
                                quantityPerBlock: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </div>
                        <div className="col-span-4 sm:col-span-2 space-y-1">
                          <Label className="text-xs">Dal blocco</Label>
                          <Input
                            type="number"
                            min={1}
                            max={totalBlocks}
                            value={r.startBlock}
                            onChange={(e) =>
                              updateRule(r.id, {
                                startBlock: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </div>
                        <div className="col-span-3 sm:col-span-2 space-y-1">
                          <Label className="text-xs">Al blocco</Label>
                          <Input
                            type="number"
                            min={1}
                            max={totalBlocks}
                            value={r.endBlock}
                            onChange={(e) =>
                              updateRule(r.id, {
                                endBlock: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => removeRule(r.id)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <DialogFooter>
        {!hasExistingPackage && (
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || eventTypes.length === 0}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Assegna pacchetto
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
