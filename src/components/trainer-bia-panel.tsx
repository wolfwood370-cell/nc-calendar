// ----------------------------------------------------------------------------
// TrainerBiaPanel — "Andamento BIA" nel profilo cliente lato coach
// ----------------------------------------------------------------------------
// Design handoff (Trainer Client Detail): grafico Peso/Massa/Grasso +
// aggiungi misurazione (anche con data passata: la query ordina per data,
// quindi l'inserimento è sempre cronologico) + modifica/elimina dal clic su
// punto o etichetta mese. Il vincolo "resta sempre ≥1" è applicato lato UI
// disabilitando l'eliminazione dell'ultima misurazione.
// ----------------------------------------------------------------------------

import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useBiaMeasurements,
  useAddBiaMeasurement,
  useUpdateBiaMeasurement,
  useDeleteBiaMeasurement,
  type BiaMeasurement,
} from "@/hooks/use-bia";
import {
  BiaMetricToggle,
  BiaSparkline,
  type BiaMetricKey,
  type BiaMetricsOverride,
} from "@/components/bia-sparkline";

// Mock coach: la metrica massa è "Massa magra" in azzurro BIA (#039be5),
// diversamente dal mock cliente che usa "Massa" in verde.
const COACH_METRICS: BiaMetricsOverride = {
  muscle: { label: "Massa magra", unit: "kg", color: "#039be5" },
};

interface FormState {
  measured_on: string;
  weight_kg: string;
  muscle_kg: string;
  fat_pct: string;
}

const EMPTY_FORM: FormState = { measured_on: "", weight_kg: "", muscle_kg: "", fat_pct: "" };

export function TrainerBiaPanel({ clientId, coachId }: { clientId: string; coachId: string }) {
  const [metric, setMetric] = useState<BiaMetricKey>("weight");
  const { data: measurements = [], isLoading } = useBiaMeasurements(clientId);
  const addMut = useAddBiaMeasurement();
  const updateMut = useUpdateBiaMeasurement();
  const deleteMut = useDeleteBiaMeasurement();

  // Dialog add/edit: editing = misurazione esistente, altrimenti nuova.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BiaMeasurement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, measured_on: format(new Date(), "yyyy-MM-dd") });
    setDialogOpen(true);
  };

  const openEdit = (m: BiaMeasurement) => {
    setEditing(m);
    setForm({
      measured_on: m.measured_on,
      weight_kg: String(m.weight_kg),
      muscle_kg: String(m.muscle_kg),
      fat_pct: String(m.fat_pct),
    });
    setDialogOpen(true);
  };

  const parsed = {
    measured_on: form.measured_on,
    weight_kg: Number(form.weight_kg),
    muscle_kg: Number(form.muscle_kg),
    fat_pct: Number(form.fat_pct),
  };
  const valid =
    !!form.measured_on &&
    parsed.weight_kg > 0 &&
    parsed.muscle_kg > 0 &&
    parsed.fat_pct >= 1 &&
    parsed.fat_pct <= 70;

  const saving = addMut.isPending || updateMut.isPending;

  const handleSave = () => {
    if (!valid) return;
    const onError = (e: Error) => {
      const missing = e.message.includes("does not exist") || e.message.includes("schema cache");
      toast.error("Misurazione non salvata", {
        description: missing
          ? "Tabella BIA non ancora attiva: applica prima la migrazione del redesign."
          : e.message,
      });
    };
    if (editing) {
      updateMut.mutate(
        { id: editing.id, client_id: clientId, ...parsed },
        {
          onSuccess: () => {
            toast.success("Misurazione aggiornata");
            setDialogOpen(false);
          },
          onError,
        },
      );
    } else {
      addMut.mutate(
        { client_id: clientId, coach_id: coachId, ...parsed },
        {
          onSuccess: () => {
            toast.success("Misurazione aggiunta");
            setDialogOpen(false);
          },
          onError,
        },
      );
    }
  };

  const handleDelete = () => {
    if (!editing) return;
    deleteMut.mutate(
      { id: editing.id, client_id: clientId },
      {
        onSuccess: () => {
          toast.success("Misurazione eliminata");
          setDialogOpen(false);
        },
        onError: (e: Error) => toast.error("Eliminazione non riuscita", { description: e.message }),
      },
    );
  };

  return (
    <section className="bg-surface-container-lowest rounded-[28px] shadow-soft-blue p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xl font-semibold text-on-surface m-0">Andamento BIA</h3>
        <BiaMetricToggle metric={metric} onChange={setMetric} metricsOverride={COACH_METRICS} />
      </div>

      {isLoading ? (
        <div className="h-32 grid place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <BiaSparkline
          measurements={measurements}
          metric={metric}
          onPointClick={openEdit}
          metricsOverride={COACH_METRICS}
          deltaLabel="total"
        />
      )}
      {measurements.length > 0 && (
        <p className="text-xs text-outline m-0">
          Clicca un punto o un'etichetta mese per modificare o eliminare la misurazione.
        </p>
      )}

      {/* CTA sotto le etichette mese, come nel mock (apre il Dialog esistente) */}
      {!isLoading && (
        <button
          type="button"
          onClick={openAdd}
          className="w-full rounded-[14px] border border-dashed border-outline-variant bg-surface py-2.5 text-[13px] font-semibold text-aura-primary hover:bg-surface-container-low transition-colors"
        >
          ＋ Aggiungi misurazione
        </button>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? `Modifica misurazione del ${format(
                    new Date(`${editing.measured_on}T00:00:00`),
                    "d MMMM yyyy",
                    { locale: it },
                  )}`
                : "Nuova misurazione BIA"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="bia-date">Data misurazione</Label>
              <Input
                id="bia-date"
                type="date"
                value={form.measured_on}
                max={format(new Date(), "yyyy-MM-dd")}
                onChange={(e) => setForm((f) => ({ ...f, measured_on: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bia-weight">Peso (kg)</Label>
              <Input
                id="bia-weight"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                value={form.weight_kg}
                onChange={(e) => setForm((f) => ({ ...f, weight_kg: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bia-muscle">Massa (kg)</Label>
              <Input
                id="bia-muscle"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                value={form.muscle_kg}
                onChange={(e) => setForm((f) => ({ ...f, muscle_kg: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bia-fat">Grasso (%)</Label>
              <Input
                id="bia-fat"
                type="number"
                inputMode="decimal"
                step="0.1"
                min="1"
                max="70"
                value={form.fat_pct}
                onChange={(e) => setForm((f) => ({ ...f, fat_pct: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {editing && (
              <Button
                variant="ghost"
                disabled={deleteMut.isPending || measurements.length <= 1}
                title={
                  measurements.length <= 1
                    ? "Deve restare almeno una misurazione"
                    : "Elimina misurazione"
                }
                onClick={handleDelete}
                className="text-error-strong hover:text-error-strong"
              >
                <Trash2 className="size-4" /> Elimina
              </Button>
            )}
            <Button disabled={!valid || saving} onClick={handleSave}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {editing ? "Salva modifiche" : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
