// ----------------------------------------------------------------------------
// CreateClientDialog — 3-step wizard for onboarding a new client
// ----------------------------------------------------------------------------
// Extracted from trainer.clients.index.tsx to keep the parent route file
// from growing past 2k lines. Parent owns the form submission handler
// (admin-create-user invocation + block/allocation persistence) and just
// passes it down as `onSubmit`.
// ----------------------------------------------------------------------------

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/lib/auth";
import { useCoachEventTypes } from "@/lib/queries";
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

export interface CreateClientPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
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

const DURATION_PRESETS: Array<{ value: string; label: string; months: number | null }> = [
  { value: "1", label: "1 Mese", months: 1 },
  { value: "3", label: "3 Mesi", months: 3 },
  { value: "6", label: "6 Mesi", months: 6 },
  { value: "12", label: "12 Mesi", months: 12 },
  { value: "custom", label: "Manuale (numero blocchi)", months: null },
];

function generateSecurePassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const out = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = 0; i < 6; i++) out.push(pick(all));
  return out.sort(() => Math.random() - 0.5).join("");
}

export function CreateClientDialog({
  open,
  onSubmit,
}: {
  open: boolean;
  onSubmit: (d: CreateClientPayload) => Promise<void>;
}) {
  const { user } = useAuth();
  const eventTypesQ = useCoachEventTypes(user?.id);
  const eventTypes = eventTypesQ.data ?? [];

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pathType, setPathType] = useState<"fixed" | "recurring" | "free">("fixed");
  const [durationPreset, setDurationPreset] = useState<string>("3");
  const [customMonths, setCustomMonths] = useState<number>(3);
  const [packLabel, setPackLabel] = useState<string | null>(null);
  const [rules, setRules] = useState<RuleDraft[]>([]);
  const [freeSessions, setFreeSessions] = useState<number>(1);
  const [freeEventTypeId, setFreeEventTypeId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the entire multi-step flow when the dialog transitions from
  // open → closed. The component stays mounted across opens (Radix gates
  // only the portaled DOM, not the React subtree), so without this the
  // next "Aggiungi Cliente" click would land on step 3 with the previous
  // values still typed in. Gated on a transition ref so we don't reset
  // on every render while the dialog is closed (which would also wipe
  // any in-progress typing from quirky external state callers).
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (wasOpenRef.current && !open) {
      setStep(1);
      setFirstName("");
      setLastName("");
      setEmail("");
      setPathType("fixed");
      setDurationPreset("3");
      setCustomMonths(3);
      setPackLabel(null);
      setRules([]);
      setFreeSessions(1);
      setFreeEventTypeId("");
      setSubmitting(false);
    }
    wasOpenRef.current = open;
  }, [open]);

  const totalBlocks =
    pathType === "recurring"
      ? 1
      : durationPreset === "custom"
        ? Math.max(1, customMonths)
        : (DURATION_PRESETS.find((d) => d.value === durationPreset)?.months ?? 1);

  function applyPtPackPreset() {
    setPathType("fixed");
    setDurationPreset("custom");
    setCustomMonths(1);
    setPackLabel("Pacchetto 3 sessioni");
    const firstEt = eventTypes.find((e) => e.base_type === "PT Session") ?? eventTypes[0];
    setRules([
      {
        id: crypto.randomUUID(),
        eventTypeId: firstEt?.id ?? "",
        quantityPerBlock: 3,
        startBlock: 1,
        endBlock: 1,
      },
    ]);
    toast.success("Preset PT Pack applicato (3 sessioni, no rinnovo)");
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

  function canProceedFrom1() {
    return firstName.trim() && lastName.trim() && /\S+@\S+\.\S+/.test(email);
  }

  async function handleFinalSubmit() {
    if (pathType === "free") {
      if (!freeEventTypeId) {
        toast.error("Seleziona un Event Type per le sessioni omaggio.");
        return;
      }
      if (freeSessions < 0) {
        toast.error("Il numero di sessioni omaggio non può essere negativo.");
        return;
      }
    } else {
      if (rules.length === 0) {
        toast.error("Aggiungi almeno una regola di assegnazione.");
        return;
      }
      for (const r of rules) {
        if (!r.eventTypeId) {
          toast.error("Seleziona un Event Type per ogni regola.");
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
      await onSubmit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email,
        password: generateSecurePassword(),
        pathType,
        totalBlocks: pathType === "free" ? 0 : totalBlocks,
        packLabel: pathType === "free" ? "Cliente Libero" : packLabel,
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
        <DialogTitle>Aggiungi Cliente — Step {step} di 3</DialogTitle>
      </DialogHeader>

      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-client-first-name">
                Nome <span className="text-error">*</span>
              </Label>
              <Input
                id="new-client-first-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-client-last-name">
                Cognome <span className="text-error">*</span>
              </Label>
              <Input
                id="new-client-last-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                aria-required="true"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-client-email">
              Email <span className="text-error">*</span>
            </Label>
            <Input
              id="new-client-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-required="true"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Verrà generata automaticamente una password sicura. Potrai copiarla al termine.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo di Percorso</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPathType("fixed");
                  setPackLabel(null);
                }}
                className={`text-left rounded-[24px] border-2 p-3 backdrop-blur-xl transition-colors ${
                  pathType === "fixed"
                    ? "border-primary bg-primary/10 shadow-[0_8px_30px_rgba(0,62,98,0.08)]"
                    : "border-white/40 bg-white/40 hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Percorso Fisso (Pacchetto)</div>
                <div className="text-xs text-muted-foreground">
                  Durata predefinita o numero blocchi manuale.
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPathType("recurring");
                  setPackLabel(null);
                }}
                className={`text-left rounded-[24px] border-2 p-3 backdrop-blur-xl transition-colors ${
                  pathType === "recurring"
                    ? "border-primary bg-primary/10 shadow-[0_8px_30px_rgba(0,62,98,0.08)]"
                    : "border-white/40 bg-white/40 hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Abbonamento Mensile</div>
                <div className="text-xs text-muted-foreground">
                  Ricorrente: nuovo blocco ogni 30 giorni.
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPathType("free");
                  setPackLabel(null);
                  if (!freeEventTypeId) {
                    const pt =
                      eventTypes.find((e) => e.base_type === "PT Session") ?? eventTypes[0];
                    if (pt) setFreeEventTypeId(pt.id);
                  }
                }}
                className={`text-left rounded-[24px] border-2 p-3 backdrop-blur-xl transition-colors ${
                  pathType === "free"
                    ? "border-primary bg-primary/10 shadow-[0_8px_30px_rgba(0,62,98,0.08)]"
                    : "border-white/40 bg-white/40 hover:border-primary/40"
                }`}
              >
                <div className="font-semibold text-sm">Cliente Libero (Senza Percorso)</div>
                <div className="text-xs text-muted-foreground">
                  Nessun blocco. Solo sessioni omaggio iniziali.
                </div>
              </button>
            </div>
          </div>

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

          {pathType === "fixed" && (
            <>
              <div className="space-y-2">
                <Label>Durata Percorso</Label>
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
                  <Label>Numero di Blocchi</Label>
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
                Il percorso sarà suddiviso in <strong>{totalBlocks}</strong> blocchi sequenziali
                (~30 giorni ciascuno). Nessun rinnovo automatico.
              </p>
            </>
          )}

          {pathType === "recurring" && (
            <p className="text-xs text-muted-foreground">
              Verrà creato <strong>1 blocco mensile</strong> con rinnovo automatico ogni 30 giorni.
              Le sessioni si resettano ad ogni rinnovo.
            </p>
          )}

          {pathType === "free" && (
            <p className="text-xs text-muted-foreground">
              Nessun blocco verrà creato. Potrai assegnare sessioni omaggio iniziali nel prossimo
              step e in qualsiasi momento dalla scheda cliente.
            </p>
          )}
        </div>
      )}

      {step === 3 && pathType === "free" && (
        <div className="space-y-4">
          <div className="rounded-[24px] bg-white/40 backdrop-blur-xl border border-white/40 shadow-[0_8px_30px_rgba(0,0,0,0.04)] p-5 space-y-4">
            <div>
              <h3 className="font-semibold text-sm text-on-surface">Sessioni Omaggio iniziali</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Verranno accreditate al cliente come crediti extra (validità 1 anno).
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Tipo di sessione</Label>
              <Select value={freeEventTypeId} onValueChange={setFreeEventTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona event type" />
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
            <div className="space-y-2">
              <Label className="text-xs">Numero di sessioni omaggio</Label>
              <Input
                type="number"
                min={0}
                max={50}
                value={freeSessions}
                onChange={(e) => setFreeSessions(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
          </div>
        </div>
      )}

      {step === 3 && pathType !== "free" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Definisci come distribuire le sessioni sui {totalBlocks} blocchi.
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={addRule}
              disabled={eventTypes.length === 0}
            >
              <Plus className="size-4" /> Aggiungi Regola
            </Button>
          </div>

          {eventTypes.length === 0 && (
            <p className="text-xs text-destructive">Crea prima almeno un Event Type.</p>
          )}

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {rules.length === 0 ? (
              <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nessuna regola. Clicca "Aggiungi Regola" per iniziare.
              </div>
            ) : (
              rules.map((r) => (
                <div key={r.id} className="rounded-2xl border p-3 space-y-3">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-5 space-y-1">
                      <Label className="text-xs">Event Type</Label>
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
                          updateRule(r.id, { startBlock: Math.max(1, Number(e.target.value) || 1) })
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
                          updateRule(r.id, { endBlock: Math.max(1, Number(e.target.value) || 1) })
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

      <DialogFooter className="gap-2 sm:gap-2">
        {step > 1 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
            disabled={submitting}
          >
            Indietro
          </Button>
        )}
        {step < 3 && (
          <Button
            type="button"
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
            disabled={step === 1 ? !canProceedFrom1() : false}
          >
            Avanti
          </Button>
        )}
        {step === 3 && (
          <Button
            type="button"
            onClick={handleFinalSubmit}
            disabled={submitting || eventTypes.length === 0}
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Crea cliente
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
