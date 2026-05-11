import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2, Check } from "lucide-react";
import type { SessionType } from "@/lib/mock-data";
import { useCoachEventTypes } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

interface Props {
  clientId: string;
  clientName: string;
  onCreated?: () => void;
}

interface RuleDraft {
  id: string;
  eventTypeId: string;
  quantityPerBlock: number;
  startBlock: number;
  endBlock: number;
}

const DURATION_PRESETS: Array<{ value: string; label: string; months: number | null }> = [
  { value: "1", label: "1 Mese", months: 1 },
  { value: "3", label: "3 Mesi", months: 3 },
  { value: "6", label: "6 Mesi", months: 6 },
  { value: "12", label: "12 Mesi", months: 12 },
  { value: "custom", label: "Personalizzato", months: null },
];

export function BlockAssignmentWizard({ clientId, clientName, onCreated }: Props) {
  const { user } = useAuth();
  const eventTypesQ = useCoachEventTypes(user?.id);
  const eventTypes = eventTypesQ.data ?? [];
  const qc = useQueryClient();

  const [durationPreset, setDurationPreset] = useState<string>("3");
  const [customMonths, setCustomMonths] = useState<number>(3);
  const [rules, setRules] = useState<RuleDraft[]>([]);

  const totalBlocks = durationPreset === "custom"
    ? Math.max(1, customMonths)
    : (DURATION_PRESETS.find((d) => d.value === durationPreset)?.months ?? 1);

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
  const updateRule = (id: string, patch: Partial<RuleDraft>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id: string) => setRules((prev) => prev.filter((r) => r.id !== id));

  const createBlocks = useMutation({
    mutationFn: async () => {
      if (!user || !clientId) throw new Error("Cliente non selezionato");
      if (rules.length === 0) throw new Error("Aggiungi almeno una regola.");
      for (const r of rules) {
        if (!r.eventTypeId) throw new Error("Seleziona una tipologia per ogni regola.");
        if (r.quantityPerBlock < 1) throw new Error("La quantità per blocco deve essere ≥ 1.");
        if (r.startBlock < 1 || r.endBlock < r.startBlock || r.endBlock > totalBlocks) {
          throw new Error(`Intervalli blocco non validi (1–${totalBlocks}).`);
        }
      }

      // Determina sequence_order e data di partenza in base ai blocchi esistenti
      const { data: lastRow } = await supabase
        .from("training_blocks")
        .select("sequence_order, end_date")
        .eq("client_id", clientId)
        .is("deleted_at", null)
        .order("sequence_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const startSeq = ((lastRow?.sequence_order as number | undefined) ?? 0) + 1;
      const baseDate = lastRow?.end_date ? new Date(lastRow.end_date as string) : new Date();
      if (lastRow?.end_date) baseDate.setDate(baseDate.getDate() + 1);

      const blocksToInsert = Array.from({ length: totalBlocks }, (_, i) => {
        const start = new Date(baseDate); start.setDate(baseDate.getDate() + i * 30);
        const end = new Date(baseDate); end.setDate(baseDate.getDate() + (i + 1) * 30 - 1);
        return {
          client_id: clientId,
          coach_id: user.id,
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          status: "active" as const,
          sequence_order: startSeq + i,
        };
      });

      const { data: blocks, error: bErr } = await supabase
        .from("training_blocks")
        .insert(blocksToInsert)
        .select("id, sequence_order, end_date");
      if (bErr) throw bErr;

      const blockBySeq = new Map<number, { id: string; end_date: string }>();
      (blocks ?? []).forEach((b) =>
        blockBySeq.set(b.sequence_order as number, { id: b.id as string, end_date: b.end_date as string })
      );

      const allocs: Array<{
        block_id: string;
        week_number: number;
        session_type: SessionType;
        event_type_id: string;
        quantity_assigned: number;
        quantity_booked: number;
        valid_until: string;
      }> = [];
      for (const rule of rules) {
        const et = eventTypes.find((e) => e.id === rule.eventTypeId);
        if (!et) continue;
        for (let m = rule.startBlock; m <= rule.endBlock; m++) {
          const seq = startSeq + (m - 1);
          const b = blockBySeq.get(seq);
          if (!b) continue;
          allocs.push({
            block_id: b.id,
            week_number: 1,
            session_type: et.base_type as SessionType,
            event_type_id: rule.eventTypeId,
            quantity_assigned: rule.quantityPerBlock,
            quantity_booked: 0,
            valid_until: b.end_date,
          });
        }
      }
      if (allocs.length > 0) {
        const { error: aErr } = await supabase.from("block_allocations").insert(allocs);
        if (aErr) throw aErr;
      }
    },
    onSuccess: () => {
      toast.success("Percorso creato", {
        description: `${totalBlocks} ${totalBlocks === 1 ? "blocco" : "blocchi"} per ${clientName}.`,
      });
      qc.invalidateQueries({ queryKey: ["blocks"] });
      qc.invalidateQueries({ queryKey: ["block-allocations"] });
      setRules([]);
      onCreated?.();
    },
    onError: (e: unknown) => toast.error("Errore", { description: (e as Error).message }),
  });

  const noEventTypes = !eventTypesQ.isLoading && eventTypes.length === 0;

  return (
    <div className="space-y-5">
      <div className="rounded-md bg-accent/40 p-3 text-sm">
        Cliente: <span className="font-medium">{clientName}</span>
      </div>

      <div className="space-y-2">
        <Label>Durata Percorso</Label>
        <Select value={durationPreset} onValueChange={setDurationPreset}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {DURATION_PRESETS.map((d) => (
              <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {durationPreset === "custom" && (
          <Input
            type="number" min={1} max={36}
            value={customMonths}
            onChange={(e) => setCustomMonths(Math.max(1, Number(e.target.value) || 1))}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Verranno creati <strong>{totalBlocks}</strong> blocchi mensili sequenziali (~30 giorni).
        </p>
      </div>

      {noEventTypes ? (
        <div className="rounded-lg border border-dashed p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            Non hai ancora creato nessuna tipologia di sessione.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/trainer/event-types">Crea tipologie sessione</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Regole di Assegnazione</Label>
            <Button type="button" size="sm" variant="secondary" onClick={addRule}>
              <Plus className="size-4" /> Aggiungi Regola
            </Button>
          </div>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {rules.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Nessuna regola. Clicca "Aggiungi Regola" per iniziare.
              </div>
            ) : rules.map((r) => (
              <div key={r.id} className="rounded-md border p-3">
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-5 space-y-1">
                    <Label className="text-xs">Tipologia</Label>
                    <Select value={r.eventTypeId} onValueChange={(v) => updateRule(r.id, { eventTypeId: v })}>
                      <SelectTrigger><SelectValue placeholder="Seleziona" /></SelectTrigger>
                      <SelectContent>
                        {eventTypes.map((et) => (
                          <SelectItem key={et.id} value={et.id}>{et.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4 sm:col-span-2 space-y-1">
                    <Label className="text-xs">Q.tà / blocco</Label>
                    <Input
                      type="number" min={1}
                      value={r.quantityPerBlock}
                      onChange={(e) => updateRule(r.id, { quantityPerBlock: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2 space-y-1">
                    <Label className="text-xs">Dal blocco</Label>
                    <Input
                      type="number" min={1} max={totalBlocks}
                      value={r.startBlock}
                      onChange={(e) => updateRule(r.id, { startBlock: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2 space-y-1">
                    <Label className="text-xs">Al blocco</Label>
                    <Input
                      type="number" min={1} max={totalBlocks}
                      value={r.endBlock}
                      onChange={(e) => updateRule(r.id, { endBlock: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" size="sm" variant="ghost" onClick={() => removeRule(r.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end border-t pt-4">
        <Button
          onClick={() => createBlocks.mutate()}
          disabled={createBlocks.isPending || noEventTypes || rules.length === 0}
        >
          {createBlocks.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Crea Percorso
        </Button>
      </div>
    </div>
  );
}
