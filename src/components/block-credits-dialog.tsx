// ----------------------------------------------------------------------------
// BlockCreditsDialog — coach-side editor for the per-block allocations
// ----------------------------------------------------------------------------
// Extracted from trainer.clients.$id.tsx. Allows the coach to add, edit,
// or remove session quotas (allocations) for a specific training block.
// Parent passes the current allocations + event types list; this dialog
// owns the draft state and persists changes via supabase on save.
// ----------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Edit3, Trash2, Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/utils";
import type { SessionType } from "@/lib/mock-data";

// Local copy of the parent's AllocationRecord shape. Kept loose
// (just the fields the dialog reads/writes) so the dialog stays
// decoupled from any future shape change in the route file.
export interface BlockAllocation {
  id: string;
  block_id: string;
  event_type_id: string | null;
  session_type: SessionType;
  quantity_assigned: number;
  quantity_booked: number;
  week_number: number;
  valid_until: string | null;
}

export interface BlockCreditsDialogProps {
  blockId: string;
  sequenceOrder: number;
  allocations: BlockAllocation[];
  eventTypes: Array<{ id: string; name: string; base_type: SessionType }>;
  onSaved: () => void;
}

export function BlockCreditsDialog({
  blockId,
  sequenceOrder,
  allocations,
  eventTypes,
  onSaved,
}: BlockCreditsDialogProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<BlockAllocation[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDraft(allocations.map((a) => ({ ...a })));
  }, [open, allocations]);

  function addRow() {
    const et = eventTypes[0];
    if (!et) {
      toast.error("Crea prima una Tipologia Evento.");
      return;
    }
    setDraft((prev) => [
      ...prev,
      {
        id: `new-${crypto.randomUUID()}`,
        block_id: blockId,
        event_type_id: et.id,
        session_type: et.base_type,
        quantity_assigned: 4,
        quantity_booked: 0,
        week_number: 1,
        valid_until: null,
      },
    ]);
  }

  function updateRow(id: string, patch: Partial<BlockAllocation>) {
    setDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setDraft((prev) => prev.filter((r) => r.id !== id));
  }

  async function save() {
    setSaving(true);
    try {
      const originalIds = new Set(allocations.map((a) => a.id));
      const draftIds = new Set(draft.filter((d) => !d.id.startsWith("new-")).map((d) => d.id));
      const toDelete = [...originalIds].filter((id) => !draftIds.has(id));
      if (toDelete.length > 0) {
        const { error } = await supabase.from("block_allocations").delete().in("id", toDelete);
        if (error) throw error;
      }
      for (const r of draft) {
        if (r.id.startsWith("new-")) {
          const { error } = await supabase.from("block_allocations").insert({
            block_id: blockId,
            event_type_id: r.event_type_id,
            session_type: r.session_type,
            quantity_assigned: r.quantity_assigned,
            quantity_booked: 0,
            week_number: r.week_number,
            valid_until: r.valid_until,
          });
          if (error) throw error;
        } else {
          const original = allocations.find((a) => a.id === r.id);
          if (
            !original ||
            original.event_type_id !== r.event_type_id ||
            original.quantity_assigned !== r.quantity_assigned ||
            original.session_type !== r.session_type
          ) {
            const { error } = await supabase
              .from("block_allocations")
              .update({
                event_type_id: r.event_type_id,
                session_type: r.session_type,
                quantity_assigned: r.quantity_assigned,
              })
              .eq("id", r.id);
            if (error) throw error;
          }
        }
      }
      toast.success("Crediti aggiornati");
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error("Salvataggio non riuscito", { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex items-center justify-center p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          title="Imposta Crediti"
          aria-label="Imposta Crediti"
        >
          <Edit3 className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Crediti — Blocco {sequenceOrder}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {draft.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun credito impostato.
            </p>
          )}
          {draft.map((r) => (
            <div key={r.id} className="grid grid-cols-12 gap-2 items-end rounded-2xl border p-2">
              <div className="col-span-7 space-y-1">
                <Label className="text-xs">Tipologia</Label>
                <Select
                  value={r.event_type_id ?? ""}
                  onValueChange={(v) => {
                    const et = eventTypes.find((e) => e.id === v);
                    updateRow(r.id, {
                      event_type_id: v,
                      session_type: et?.base_type ?? r.session_type,
                    });
                  }}
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
              <div className="col-span-4 space-y-1">
                <Label className="text-xs">Crediti</Label>
                <Input
                  type="number"
                  min={1}
                  value={r.quantity_assigned}
                  onChange={(e) =>
                    updateRow(r.id, { quantity_assigned: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>
              <div className="col-span-1 flex justify-end">
                <Button size="icon" variant="ghost" onClick={() => removeRow(r.id)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          <Button variant="secondary" size="sm" onClick={addRow}>
            <Plus className="size-4" /> Aggiungi
          </Button>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Annulla
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Salva
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
