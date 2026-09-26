// ----------------------------------------------------------------------------
// Pacchetto — dialog condiviso (passata 02, audit O2)
// ----------------------------------------------------------------------------
// Sostituisce il rinnovo della Panoramica (che portava al profilo) e
// assign-package-dialog.tsx del Profilo. Tre scelte: Rinnova lo stesso (non
// per i clienti liberi), Crediti extra, Nuovo percorso. Scritture in
// lib/package-actions.ts; ogni scelta ha il toast con «Ripristina».
// Riferimento: design_handoff_coach_redesign/designs/Coach Pacchetto.dc.html.
// ----------------------------------------------------------------------------

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseISO } from "date-fns";
import { Loader2, Minus, Plus } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CoachDialog,
  CoachDialogContent,
  CoachDialogHeader,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { useAuth } from "@/lib/auth";
import { clientPlanLabel } from "@/lib/client-search";
import { getCurrentBlockCredits, sumCredits } from "@/lib/credits";
import { toIsoDate } from "@/lib/current-block";
import {
  BLOCKS_MAX,
  BLOCKS_MIN,
  blockLength,
  CREDITS_PER_BLOCK_MAX,
  EXTRA_MAX,
  EXTRA_MIN,
  addExtraCredits,
  assignNewPath,
  canRenew,
  creditsByType,
  formatCredits,
  lastBlock,
  nextBlockDates,
  renewNote,
  renewPackage,
  undoPackageChange,
  type PackageBlock,
  type PackageChange,
  type PackageMode,
} from "@/lib/package-actions";
import { supabasePackageStore } from "@/lib/package-store";
import { useClientBlocks, useCoachEventTypes } from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { formatShortDate } from "@/lib/session-time";
import { toastWithUndo } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { cn, errorMessage } from "@/lib/utils";

export interface PackageDialogProps {
  /** Cliente di cui gestire il pacchetto; null = dialog chiuso. */
  clientId: string | null;
  /**
   * Scelta con cui si apre (la Panoramica apre su «Rinnova lo stesso»). Se non
   * è possibile, o non è indicata: rinnovo se c'è un blocco da rinnovare,
   * altrimenti crediti extra per i clienti liberi e nuovo percorso per gli altri.
   */
  initialMode?: PackageMode;
  onClose: () => void;
  /** Dopo una modifica o un ripristino riusciti. */
  onChanged?: () => void;
}

export function PackageDialog({ clientId, initialMode, onClose, onChanged }: PackageDialogProps) {
  return (
    <CoachDialog open={!!clientId} onOpenChange={(o) => !o && onClose()}>
      {clientId && (
        <CoachDialogContent className="gap-[18px] sm:max-w-[580px]">
          <PackageBody
            key={clientId}
            clientId={clientId}
            initialMode={initialMode}
            onClose={onClose}
            onChanged={onChanged}
          />
        </CoachDialogContent>
      )}
    </CoachDialog>
  );
}

const segmentItem =
  "h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors data-[state=checked]:bg-surface-container-lowest data-[state=checked]:text-aura-primary data-[state=checked]:shadow-[0_1px_3px_rgba(0,0,0,0.1)] data-[state=unchecked]:text-on-surface-variant";

function Stepper({
  value,
  min,
  max,
  onChange,
  decLabel,
  incLabel,
  size = "md",
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  decLabel: string;
  incLabel: string;
  size?: "md" | "sm";
}) {
  const button = cn(
    "grid place-items-center rounded-full border border-surface-variant transition-colors hover:bg-surface-container-low disabled:opacity-40",
    size === "md" ? "size-8" : "size-[30px]",
  );
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={decLabel}
        className={button}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus className="size-3.5" aria-hidden />
      </button>
      <output
        aria-live="polite"
        className={cn(
          "text-center font-bold",
          size === "md" ? "w-7 text-base" : "w-[26px] text-sm",
        )}
      >
        {value}
      </output>
      <button
        type="button"
        aria-label={incLabel}
        className={cn(button, "text-aura-primary")}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function ModeCard({ value, label, hint }: { value: PackageMode; label: string; hint: string }) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      className="flex flex-col items-start gap-1 rounded-[18px] border-[1.5px] border-surface-variant bg-surface-container-lowest px-3.5 py-3 text-left transition-colors hover:bg-surface-container-low data-[state=checked]:border-aura-primary data-[state=checked]:bg-aura-primary/5"
    >
      <span className="text-sm font-bold text-on-surface">{label}</span>
      <span className="text-xs leading-[1.4] text-on-surface-variant">{hint}</span>
    </RadioGroupPrimitive.Item>
  );
}

function TypeDot({ color, square = false }: { color: string; square?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("shrink-0", square ? "size-2.5 rounded-[3px]" : "size-2 rounded-full")}
      style={{ backgroundColor: color }}
    />
  );
}

function PackageBody({
  clientId,
  initialMode,
  onClose,
  onChanged,
}: {
  clientId: string;
  initialMode?: PackageMode;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const typesQ = useCoachEventTypes(user?.id);
  const blocksQ = useClientBlocks(clientId);
  const profileQ = useQuery({
    queryKey: ["package-profile", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, coach_id, path_type, pack_label")
        .eq("id", clientId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const types = useMemo(() => typesQ.data ?? [], [typesQ.data]);
  const blocks: PackageBlock[] = useMemo(
    () =>
      (blocksQ.data ?? []).map((b) => ({
        id: b.id,
        sequence_order: b.sequence_order,
        start_date: b.start_date,
        end_date: b.end_date,
        duration_days: null,
        grace_days: null,
        allocations: b.allocations,
      })),
    [blocksQ.data],
  );
  const profile = profileQ.data ?? null;
  const today = toIsoDate(new Date());

  const [pickedMode, setPickedMode] = useState<PackageMode | null>(null);
  const [extraTypeId, setExtraTypeId] = useState<string | null>(null);
  const [extraQty, setExtraQty] = useState(2);
  const [pathType, setPathType] = useState<"fixed" | "recurring" | null>(null);
  const [pathBlocks, setPathBlocks] = useState(3);
  const [pathCredits, setPathCredits] = useState<Record<string, number> | null>(null);
  const [pending, setPending] = useState(false);

  const loading = profileQ.isLoading || blocksQ.isLoading || typesQ.isLoading;
  const free = profile?.path_type === "free";
  const renewable = !!profile && canRenew(profile, blocks);
  const fallbackMode: PackageMode = renewable ? "renew" : free ? "extra" : "path";
  const wanted = pickedMode ?? initialMode ?? fallbackMode;
  const mode: PackageMode = wanted === "renew" && !renewable ? fallbackMode : wanted;

  const last = lastBlock(blocks);
  // Rinnovo e nuovo percorso partono entrambi il giorno dopo l'ultimo blocco.
  const newBlock = nextBlockDates(last, today, blockLength(last));
  const firstDay = formatShortDate(parseISO(newBlock.start));
  const residual = sumCredits(
    getCurrentBlockCredits(
      blocksQ.data ?? [],
      (blocksQ.data ?? []).flatMap((b) => b.allocations),
    ),
  ).left;
  const renewRows = creditsByType(last, types);
  const hasFutureBlocks = blocks.some((b) => b.start_date.slice(0, 10) > today);

  const extraType =
    types.find((t) => t.id === extraTypeId) ??
    types.find((t) => t.base_type === "PT Session") ??
    types[0] ??
    null;
  const effectivePathType =
    pathType ?? (profile?.path_type === "recurring" ? "recurring" : "fixed");
  const defaultCredits = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const r of creditsByType(last, types)) byType[r.type.id] = r.qty;
    return byType;
  }, [last, types]);
  const credits = pathCredits ?? defaultCredits;
  const perBlock = types.reduce((n, t) => n + (credits[t.id] ?? 0), 0);

  const name = profile?.full_name ?? profile?.email ?? "cliente";
  const coachId = profile?.coach_id ?? user?.id ?? null;
  const disabled =
    pending ||
    loading ||
    !profile ||
    !coachId ||
    (mode === "extra" && !extraType) ||
    (mode === "path" && perBlock === 0);
  const cta =
    mode === "renew" ? "Rinnova" : mode === "extra" ? "Aggiungi crediti" : "Assegna percorso";

  const refresh = () => {
    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.client(clientId) });
    qc.invalidateQueries({ queryKey: queryKeys.extraCredits.client(clientId) });
    qc.invalidateQueries({ queryKey: ["package-profile", clientId] });
    onChanged?.();
  };

  const undo = async (change: PackageChange) => {
    try {
      await undoPackageChange(supabasePackageStore, change);
      toast.success("Pacchetto ripristinato.");
    } catch (e) {
      toast.error("Ripristino non riuscito", { description: errorMessage(e) });
    } finally {
      refresh();
    }
  };

  const confirm = async () => {
    if (disabled || !coachId) return;
    setPending(true);
    try {
      let change: PackageChange;
      let message: string;
      if (mode === "renew") {
        change = await renewPackage(supabasePackageStore, { clientId, coachId, today });
        message = `Pacchetto rinnovato per ${name}.`;
      } else if (mode === "extra") {
        change = await addExtraCredits(supabasePackageStore, {
          clientId,
          eventTypeId: extraType!.id,
          quantity: extraQty,
        });
        message =
          extraQty === 1
            ? `1 credito ${extraType!.name} aggiunto a ${name}.`
            : `${extraQty} crediti ${extraType!.name} aggiunti a ${name}.`;
      } else {
        change = await assignNewPath(supabasePackageStore, {
          clientId,
          coachId,
          today,
          pathType: effectivePathType,
          blocks: pathBlocks,
          credits: types.map((t) => ({
            eventTypeId: t.id,
            sessionType: t.base_type,
            perBlock: credits[t.id] ?? 0,
          })),
        });
        message = `Nuovo percorso assegnato a ${name}.`;
      }
      refresh();
      onClose();
      toastWithUndo(message, () => void undo(change));
    } catch (e) {
      toast.error("Pacchetto non aggiornato", { description: errorMessage(e) });
      refresh();
    } finally {
      setPending(false);
    }
  };

  let body: ReactNode = null;
  if (loading) {
    body = (
      <div className="grid place-items-center py-10 text-outline">
        <Loader2 className="size-5 animate-spin" aria-hidden />
      </div>
    );
  } else if (mode === "renew") {
    body = (
      <>
        <div className="flex flex-col gap-2.5 rounded-[20px] bg-surface-container-low px-[18px] py-4">
          <div className="flex justify-between gap-3 text-sm">
            <span className="text-on-surface-variant">Nuovo blocco</span>
            <strong className="text-on-surface">
              {firstDay} – {formatShortDate(parseISO(newBlock.end))}
            </strong>
          </div>
          <div className="h-px bg-surface-variant" />
          {renewRows.map((r) => (
            <div key={r.type.id} className="flex items-center gap-2.5 text-sm">
              <TypeDot color={r.type.color} />
              <span className="flex-1 text-on-surface">{r.type.name}</span>
              <strong className="text-on-surface">{formatCredits(r.qty)}</strong>
            </div>
          ))}
        </div>
        <p className="text-[13px] leading-normal text-on-surface-variant">
          {renewNote(firstDay, residual)}
        </p>
      </>
    );
  } else if (mode === "extra") {
    body = (
      <div className="flex flex-col gap-2.5">
        <RadioGroupPrimitive.Root
          value={extraType?.id ?? ""}
          onValueChange={setExtraTypeId}
          aria-label="Tipologia di sessione"
          orientation="horizontal"
          className="flex flex-wrap gap-2"
        >
          {types.map((t) => (
            <RadioGroupPrimitive.Item
              key={t.id}
              value={t.id}
              className="flex h-[34px] items-center gap-2 rounded-full border border-surface-variant bg-surface-container-lowest px-3.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low data-[state=checked]:border-aura-primary data-[state=checked]:bg-aura-primary/[0.08] data-[state=checked]:text-aura-primary"
            >
              <TypeDot color={t.color} />
              {t.name}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-on-surface">Quantità</span>
          <Stepper
            value={extraQty}
            min={EXTRA_MIN}
            max={EXTRA_MAX}
            onChange={setExtraQty}
            decLabel="Meno"
            incLabel="Più"
          />
        </div>
        <p className="text-xs text-outline">Si aggiungono ai crediti disponibili del cliente.</p>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <RadioGroupPrimitive.Root
          value={effectivePathType}
          onValueChange={(v) => setPathType(v as "fixed" | "recurring")}
          aria-label="Tipo di percorso"
          orientation="horizontal"
          className="flex self-start rounded-full bg-surface-container p-[3px]"
        >
          <RadioGroupPrimitive.Item value="fixed" className={segmentItem}>
            Percorso fisso
          </RadioGroupPrimitive.Item>
          <RadioGroupPrimitive.Item value="recurring" className={segmentItem}>
            Abbonamento mensile
          </RadioGroupPrimitive.Item>
        </RadioGroupPrimitive.Root>
        {effectivePathType === "fixed" && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-on-surface">Numero di blocchi</span>
            <Stepper
              value={pathBlocks}
              min={BLOCKS_MIN}
              max={BLOCKS_MAX}
              onChange={setPathBlocks}
              decLabel="Meno blocchi"
              incLabel="Più blocchi"
            />
            <span className="text-xs text-outline">da 4 settimane</span>
          </div>
        )}
        <p className="text-[13px] font-bold text-on-surface">Crediti per blocco</p>
        <div className="flex flex-col rounded-[18px] border border-surface-container">
          {types.map((t, i) => (
            <div
              key={t.id}
              className={cn(
                "flex items-center gap-2.5 px-3.5 py-[9px]",
                i > 0 && "border-t border-surface-container-low",
              )}
            >
              <TypeDot color={t.color} square />
              <span className="flex-1 text-sm font-semibold text-on-surface">{t.name}</span>
              <Stepper
                size="sm"
                value={credits[t.id] ?? 0}
                min={0}
                max={CREDITS_PER_BLOCK_MAX}
                onChange={(v) => setPathCredits({ ...credits, [t.id]: v })}
                decLabel={`Meno ${t.name}`}
                incLabel={`Più ${t.name}`}
              />
            </div>
          ))}
        </div>
        <p className="text-xs text-outline">
          Inizia il {firstDay}. Le sessioni già prenotate restano in calendario.
        </p>
      </div>
    );
  }

  return (
    <>
      <CoachDialogHeader
        title={`Pacchetto di ${profile?.full_name ?? profile?.email ?? "…"}`}
        description={
          <p className="text-[13px] text-on-surface-variant">
            {profile ? clientPlanLabel(profile) : "Caricamento…"}
          </p>
        }
      />
      {!loading && (
        <RadioGroupPrimitive.Root
          value={mode}
          onValueChange={(v) => setPickedMode(v as PackageMode)}
          aria-label="Cosa fare del pacchetto"
          orientation="horizontal"
          className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]"
        >
          {renewable && (
            <ModeCard
              value="renew"
              label="Rinnova lo stesso"
              hint="Stessi crediti, nuovo blocco."
            />
          )}
          <ModeCard value="extra" label="Crediti extra" hint="Aggiungi crediti singoli." />
          <ModeCard
            value="path"
            label="Nuovo percorso"
            hint={
              free || blocks.length === 0
                ? "Percorso fisso o abbonamento."
                : hasFutureBlocks
                  ? "Parte dopo l'ultimo blocco in programma."
                  : "Sostituisce il percorso attuale."
            }
          />
        </RadioGroupPrimitive.Root>
      )}
      {body}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          className={dialogSecondaryButton}
          onClick={onClose}
          disabled={pending}
        >
          Annulla
        </button>
        <button
          type="button"
          className={dialogPrimaryButton}
          onClick={() => void confirm()}
          disabled={disabled}
        >
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {cta}
        </button>
      </div>
    </>
  );
}
