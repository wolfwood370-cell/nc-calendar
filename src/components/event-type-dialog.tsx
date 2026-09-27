// ----------------------------------------------------------------------------
// Dialog «Nuova tipologia» / «Modifica tipologia», desktop (passata 07, E5)
// ----------------------------------------------------------------------------
// Aspetto di Coach Tipologie.dc.html (600 px). Gli errori del nome stanno
// sotto il campo dal primo tentativo di salvare; i controlli veri li rifà il
// modulo (event-type-actions.ts) con i dati appena letti. Il valore attuale
// di durata, margine e colore non si perde: se non è fra i segmenti compare
// in più, selezionato.
// ----------------------------------------------------------------------------

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check, Loader2, MapPin, TriangleAlert, Video } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CoachDialog,
  CoachDialogContent,
  CoachDialogHeader,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { SegmentedControl } from "@/components/segmented-control";
import { STUDIO_BLUE, lowContrastOnWhite, sameColor } from "@/lib/event-colors";
import {
  EventTypeRuleError,
  saveEventType,
  type EventTypeInput,
  type EventTypeStore,
  type SaveResult,
} from "@/lib/event-type-actions";
import {
  ADDRESS_MAX,
  DEFAULT_UNAVAILABLE_MESSAGE,
  DESCRIPTION_MAX,
  GOOGLE_COLOR_NOTE,
  MESSAGE_MAX,
  NAME_ERRORS,
  NAME_MAX,
  bufferOptions,
  colorOptions,
  durationOptions,
  isNameLocked,
  lacksGoogleColor,
  nameProblem,
  type NameProblem,
} from "@/lib/event-type-rules";
import type { EventTypeRow } from "@/lib/queries";
import { cn, errorMessage } from "@/lib/utils";

/** Una tipologia nuova parte coi valori del prototipo. */
const NEW_TYPE: EventTypeInput = {
  name: "",
  description: "",
  color: STUDIO_BLUE.hex,
  duration: 60,
  buffer_minutes: 10,
  location_type: "physical",
  location_address: "",
  client_bookable: true,
  unavailable_message: "",
};

function inputOf(t: EventTypeRow): EventTypeInput {
  return {
    name: t.name,
    description: t.description ?? "",
    color: t.color,
    duration: t.duration,
    buffer_minutes: t.buffer_minutes,
    location_type: t.location_type,
    location_address: t.location_address ?? "",
    client_bookable: t.client_bookable,
    unavailable_message: t.unavailable_message ?? "",
  };
}

const FIELD =
  "w-full rounded-[14px] bg-surface-container-low px-3.5 text-sm text-on-surface outline-none transition-colors placeholder:text-outline focus:bg-white focus:ring-2 focus:ring-primary-container";

export interface EventTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = nuova tipologia. */
  initial: EventTypeRow | null;
  coachId: string;
  store: EventTypeStore;
  /** Tipologie del coach, per i doppioni. */
  types: readonly EventTypeRow[];
  /** Titoli dei pacchetti attivi; undefined finché non si sanno. */
  shopTitles: readonly string[] | undefined;
  onSaved: (result: SaveResult, before: EventTypeRow | null) => void;
}

export function EventTypeDialog(props: EventTypeDialogProps) {
  return (
    <CoachDialog open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && (
        <CoachDialogContent aria-describedby={undefined} className="gap-[18px] sm:max-w-[600px]">
          <EventTypeForm key={props.initial?.id ?? "new"} {...props} />
        </CoachDialogContent>
      )}
    </CoachDialog>
  );
}

function EventTypeForm({
  initial,
  coachId,
  store,
  types,
  shopTitles,
  onOpenChange,
  onSaved,
}: EventTypeDialogProps) {
  const ids = useId();
  const [v, setV] = useState<EventTypeInput>(() => (initial ? inputOf(initial) : NEW_TYPE));
  const [tried, setTried] = useState(false);
  const [serverProblem, setServerProblem] = useState<NameProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<EventTypeInput>) => setV((prev) => ({ ...prev, ...patch }));

  const locked = !!initial && !!shopTitles && isNameLocked(initial.name, shopTitles);
  const self = initial ? { id: initial.id, name: initial.name } : null;
  const problem = nameProblem(v.name, self, types, shopTitles ?? []) ?? serverProblem;
  const nameError = tried && problem ? NAME_ERRORS[problem] : null;
  const colors = colorOptions(initial?.color ?? v.color);
  const selectedColor = colors.find((c) => sameColor(c.hex, v.color))?.hex ?? v.color;
  const previewName = v.name.trim() || "Nuova tipologia";

  const submit = async () => {
    setTried(true);
    if (nameProblem(v.name, self, types, shopTitles ?? [])) return;
    setSaving(true);
    try {
      const result = await saveEventType(store, { coachId, before: initial, values: v });
      onSaved(result, initial);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof EventTypeRuleError && e.problem !== "invalid") {
        setServerProblem(e.problem);
      } else {
        toast.error("Tipologia non salvata.", { description: errorMessage(e) });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-[18px]"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <CoachDialogHeader title={initial ? "Modifica tipologia" : "Nuova tipologia"} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-name`} className="text-[13px] font-bold text-on-surface">
          Nome
        </label>
        <input
          id={`${ids}-name`}
          value={v.name}
          onChange={(e) => {
            setServerProblem(null);
            set({ name: e.target.value });
          }}
          readOnly={locked}
          maxLength={NAME_MAX}
          placeholder="Es. Personal Training"
          aria-invalid={!!nameError}
          aria-describedby={nameError || locked ? `${ids}-name-note` : undefined}
          className={cn(
            FIELD,
            "h-[42px] border-[1.5px]",
            nameError ? "border-danger-text" : "border-transparent",
            locked && "cursor-default text-on-surface-variant focus:bg-surface-container-low",
          )}
        />
        {nameError ? (
          <span id={`${ids}-name-note`} className="text-xs font-semibold text-danger-text">
            {nameError}
          </span>
        ) : (
          locked && (
            <span id={`${ids}-name-note`} className="text-xs text-outline">
              {NAME_ERRORS.locked}
            </span>
          )
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${ids}-desc`} className="text-[13px] font-bold text-on-surface">
          Descrizione <span className="font-medium text-outline">(la vedono i clienti)</span>
        </label>
        <textarea
          id={`${ids}-desc`}
          value={v.description}
          onChange={(e) => set({ description: e.target.value })}
          rows={2}
          maxLength={DESCRIPTION_MAX}
          className={cn(FIELD, "resize-y py-2.5 leading-normal")}
        />
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-3.5">
        <Field label="Durata">
          <SegmentedControl
            ariaLabel="Durata"
            value={String(v.duration)}
            options={durationOptions(initial?.duration ?? v.duration).map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            onChange={(x) => set({ duration: Number(x) })}
            className="self-start whitespace-nowrap"
          />
        </Field>
        <Field label="Margine dopo la sessione">
          <SegmentedControl
            ariaLabel="Margine dopo la sessione"
            value={String(v.buffer_minutes)}
            options={bufferOptions(initial?.buffer_minutes ?? v.buffer_minutes).map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            onChange={(x) => set({ buffer_minutes: Number(x) })}
            className="self-start whitespace-nowrap"
          />
        </Field>
      </div>

      <Field label="Luogo">
        <RadioGroupPrimitive.Root
          value={v.location_type}
          onValueChange={(x) => set({ location_type: x as EventTypeInput["location_type"] })}
          aria-label="Luogo"
          className="grid grid-cols-2 gap-2"
        >
          {(
            [
              ["physical", "In studio", MapPin],
              ["online", "Online", Video],
            ] as const
          ).map(([value, label, Icon]) => (
            <RadioGroupPrimitive.Item
              key={value}
              value={value}
              className={cn(
                "flex h-11 items-center gap-2.5 rounded-[14px] border-[1.5px] px-3.5 text-sm font-semibold text-on-surface transition-colors",
                "data-[state=checked]:border-aura-primary data-[state=checked]:bg-aura-primary/5",
                "data-[state=unchecked]:border-surface-variant data-[state=unchecked]:bg-white",
              )}
            >
              <Icon className="size-4 text-aura-primary" aria-hidden />
              {label}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        {v.location_type === "physical" && (
          <>
            <input
              value={v.location_address}
              onChange={(e) => set({ location_address: e.target.value })}
              maxLength={ADDRESS_MAX}
              placeholder="Indirizzo dello studio"
              aria-label="Indirizzo"
              className={cn(FIELD, "h-[42px]")}
            />
            <span className="text-xs text-outline">I clienti possono aprirlo in Google Maps.</span>
          </>
        )}
      </Field>

      <Field label="Colore">
        <RadioGroupPrimitive.Root
          value={selectedColor}
          onValueChange={(hex) => set({ color: hex })}
          aria-label="Colore"
          orientation="horizontal"
          loop
          className="flex flex-wrap gap-2"
        >
          {colors.map((c) => (
            <RadioGroupPrimitive.Item
              key={c.hex}
              value={c.hex}
              aria-label={c.name}
              title={c.name}
              className="grid size-8 place-items-center rounded-full text-white data-[state=checked]:shadow-[0_0_0_2px_#ffffff,0_0_0_4px_#191c1f]"
              style={{ backgroundColor: c.hex }}
            >
              <RadioGroupPrimitive.Indicator>
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
              </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface p-3">
          <span className="text-xs text-outline">In calendario:</span>
          <span
            className="flex w-[170px] flex-col gap-px rounded-[10px] px-[9px] py-[5px] text-white"
            style={{ backgroundColor: v.color }}
          >
            <span className="text-xs font-bold">Nome cliente</span>
            <span className="truncate text-[11px] opacity-[0.92]">{previewName} · 10:30</span>
          </span>
          {lowContrastOnWhite(v.color) && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-warning-text">
              <TriangleAlert className="size-3.5" aria-hidden />
              Testo bianco poco leggibile su questo colore
            </span>
          )}
        </div>
        {lacksGoogleColor(v.color) && (
          <span className="text-xs text-outline">{GOOGLE_COLOR_NOTE}</span>
        )}
      </Field>

      <button
        type="button"
        role="switch"
        aria-checked={v.client_bookable}
        onClick={() => set({ client_bookable: !v.client_bookable })}
        className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-10 shrink-0 rounded-full p-[3px] transition-colors",
            v.client_bookable ? "justify-end bg-aura-primary" : "justify-start bg-outline-variant",
          )}
        >
          <span className="size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
        </span>
        <span className="flex flex-col gap-0.5">
          <strong className="text-sm font-bold text-on-surface">Prenotabile dai clienti</strong>
          <span className="text-xs text-on-surface-variant">
            Se disattivo, solo tu puoi fissare questa sessione.
          </span>
        </span>
      </button>

      {!v.client_bookable && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${ids}-msg`} className="text-[13px] font-bold text-on-surface">
            Messaggio per i clienti
          </label>
          <textarea
            id={`${ids}-msg`}
            value={v.unavailable_message}
            onChange={(e) => set({ unavailable_message: e.target.value })}
            rows={2}
            maxLength={MESSAGE_MAX}
            placeholder="Es. Per prenotare questa sessione scrivimi su WhatsApp."
            aria-describedby={`${ids}-msg-note`}
            className={cn(FIELD, "resize-y py-2.5 leading-normal")}
          />
          <span id={`${ids}-msg-note`} className="text-xs text-outline">
            Se lo lasci vuoto leggono: «{DEFAULT_UNAVAILABLE_MESSAGE}»
          </span>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className={dialogSecondaryButton} onClick={() => onOpenChange(false)}>
          Annulla
        </button>
        <button type="submit" className={dialogPrimaryButton} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {initial ? "Salva modifiche" : "Crea tipologia"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-bold text-on-surface">{label}</p>
      {children}
    </div>
  );
}
