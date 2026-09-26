// ----------------------------------------------------------------------------
// Assegna evento — dialog condiviso (passata 02)
// ----------------------------------------------------------------------------
// Sostituisce review-booking-dialog.tsx. Resta montato nel layout /trainer e
// si apre da qualunque pagina con `?reviewEventId=<booking>`: Panoramica
// («Assegna»), Calendario (tile tratteggiato), agenda mobile. Tre modalità:
// sessione cliente (con credito scalato a scelta), consulenza esterna,
// impegno personale (RPC mark_booking_special). Regole in lib/assign-event.ts.
// Riferimento: design_handoff_coach_redesign/designs/Coach Assegna Evento.dc.html.
// ----------------------------------------------------------------------------

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Coffee, Loader2, MessageCircle, Search, User, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CoachDialog,
  CoachDialogContent,
  CoachDialogHeader,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import {
  assignEventToClient,
  countAvailableCredits,
  eventTitle,
  guessClientFromTitle,
  guessEventType,
  isAssignable,
  markEventSpecial,
  undoAssign,
  type AssignableEvent,
  type AssignResult,
} from "@/lib/assign-event";
import { useAuth } from "@/lib/auth";
import { clientPlanLabel, searchClients } from "@/lib/client-search";
import { initials } from "@/lib/initials";
import {
  useClientBlocks,
  useClientExtraCredits,
  useCoachClients,
  useCoachEventTypes,
} from "@/lib/queries";
import { invalidateBookingScope, queryKeys } from "@/lib/query-keys";
import { supabase } from "@/integrations/supabase/client";
import { supabaseAssignStore } from "@/lib/session-store";
import { formatShortDay, formatTimeRange } from "@/lib/session-time";
import { toastWithUndo } from "@/lib/toast";
import { cn, errorMessage } from "@/lib/utils";

type Mode = "client" | "consulenza" | "personal";

const MODES: Array<{ id: Mode; label: string; hint: string; icon: LucideIcon }> = [
  {
    id: "client",
    label: "Sessione cliente",
    hint: "Collegata a un cliente registrato.",
    icon: User,
  },
  {
    id: "consulenza",
    label: "Consulenza esterna",
    hint: "Per chi non è cliente. Nessun credito.",
    icon: MessageCircle,
  },
  {
    id: "personal",
    label: "Impegno personale",
    hint: "Tempo tuo, non collegato a nessuno.",
    icon: Coffee,
  },
];

const OTHER_HINT: Record<Exclude<Mode, "client">, string> = {
  consulenza: "L'evento resta in calendario come consulenza e occupa lo slot. Non scala crediti.",
  personal:
    "L'evento resta in calendario come impegno personale e blocca lo slot per le prenotazioni.",
};

type DialogEvent = AssignableEvent & { duration_min: number | null };

export interface AssignEventDialogProps {
  /** Booking id da `?reviewEventId=`; null = dialog chiuso. */
  eventId: string | null;
  onClose: () => void;
}

export function AssignEventDialog({ eventId, onClose }: AssignEventDialogProps) {
  return (
    <CoachDialog open={!!eventId} onOpenChange={(o) => !o && onClose()}>
      {eventId && (
        <CoachDialogContent className="gap-5 sm:max-w-[560px]">
          {/* key: ogni evento riparte da modalità, cliente e tipologia suggeriti. */}
          <AssignEventBody key={eventId} eventId={eventId} onClose={onClose} />
        </CoachDialogContent>
      )}
    </CoachDialog>
  );
}

function AssignEventBody({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const clientsQ = useCoachClients(user?.id);
  const typesQ = useCoachEventTypes(user?.id);
  const eventQ = useQuery({
    queryKey: ["assign-event", eventId],
    queryFn: async (): Promise<DialogEvent | null> => {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, status, deleted_at, client_id, coach_id, is_personal, category, block_id, event_type_id, session_type, scheduled_at, title, notes, duration_min",
        )
        .eq("id", eventId)
        .maybeSingle();
      if (error) throw error;
      return (data as DialogEvent | null) ?? null;
    },
  });

  const [mode, setMode] = useState<Mode>("client");
  const [q, setQ] = useState("");
  const [pickedClientId, setPickedClientId] = useState<string | null>(null);
  const [pickedTypeId, setPickedTypeId] = useState<string | null>(null);
  const [useCredit, setUseCredit] = useState(true);
  const [pending, setPending] = useState(false);

  const event = eventQ.data ?? null;
  const title = event ? eventTitle(event) : "";
  const clients = useMemo(
    () =>
      (clientsQ.data ?? [])
        .filter((c) => c.status !== "archived")
        .sort((a, b) =>
          (a.full_name ?? a.email ?? "").localeCompare(b.full_name ?? b.email ?? "", "it"),
        ),
    [clientsQ.data],
  );
  const types = useMemo(() => typesQ.data ?? [], [typesQ.data]);
  const guessed = useMemo(() => guessClientFromTitle(title, clients), [title, clients]);
  const clientId = pickedClientId ?? guessed?.id ?? null;
  const client = clients.find((c) => c.id === clientId) ?? null;
  const eventType = types.find((t) => t.id === pickedTypeId) ?? guessEventType(title, types);
  const visibleClients = q.trim() ? searchClients(clients, q, clients.length) : clients;

  // Il cliente suggerito può stare in fondo all'elenco: lo si porta in vista.
  const listRef = useRef<HTMLDivElement>(null);
  const guessedId = guessed?.id ?? null;
  useEffect(() => {
    if (!guessedId) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-client-id="${guessedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [guessedId]);

  const blocksQ = useClientBlocks(client?.id);
  const extrasQ = useClientExtraCredits(client?.id);
  const available =
    client && eventType && event
      ? countAvailableCredits({
          blocks: blocksQ.data ?? [],
          extras: extrasQ.data ?? [],
          scheduledAt: event.scheduled_at,
          type: eventType,
        })
      : 0;
  const canCredit = !!client && available > 0;
  const creditOn = canCredit && useCredit;
  const clientName = client?.full_name ?? client?.email ?? "Il cliente";
  const creditHint = !client
    ? "Scegli un cliente per vedere i crediti disponibili."
    : !eventType
      ? "Scegli una tipologia di sessione."
      : available > 0
        ? `${clientName} ha ${available === 1 ? "1 credito" : `${available} crediti`} ${eventType.name} ${available === 1 ? "disponibile" : "disponibili"}.`
        : `${clientName} non ha crediti ${eventType.name}: la sessione non scala dal pacchetto.`;

  const refresh = (clientIdTouched: string | null) => {
    invalidateBookingScope(qc, { coachId: user?.id, clientId: clientIdTouched });
    qc.invalidateQueries({ queryKey: queryKeys.clients.coach(user?.id) });
    qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(user?.id) });
    qc.invalidateQueries({ queryKey: ["assign-event", eventId] });
  };

  const undo = async (result: AssignResult) => {
    try {
      await undoAssign(supabaseAssignStore, result);
      toast.success("L'evento è di nuovo da assegnare.");
    } catch (e) {
      toast.error("Ripristino non riuscito", { description: errorMessage(e) });
    } finally {
      refresh(result.next.client_id);
    }
  };

  const confirm = async () => {
    if (!event) return;
    setPending(true);
    try {
      let result: AssignResult;
      let message: string;
      if (mode === "client") {
        if (!client || !eventType) return;
        result = await assignEventToClient(supabaseAssignStore, {
          eventId: event.id,
          clientId: client.id,
          type: { id: eventType.id, base_type: eventType.base_type },
          useCredit: creditOn,
        });
        message = `«${title}» assegnato a ${clientName}.`;
      } else {
        result = await markEventSpecial(supabaseAssignStore, event.id, mode);
        message =
          mode === "consulenza"
            ? `«${title}» segnato come consulenza.`
            : `«${title}» segnato come impegno personale.`;
      }
      refresh(result.next.client_id);
      onClose();
      toastWithUndo(message, () => void undo(result));
    } catch (e) {
      toast.error("Assegnazione non riuscita", { description: errorMessage(e) });
      refresh(null);
    } finally {
      setPending(false);
    }
  };

  if (eventQ.isLoading) {
    return (
      <>
        <CoachDialogHeader
          title="Assegna evento"
          description={<p className="text-sm text-on-surface-variant">Caricamento…</p>}
        />
        <div className="grid place-items-center py-10 text-outline">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      </>
    );
  }

  if (!event || !isAssignable(event)) {
    return (
      <>
        <CoachDialogHeader
          title="Assegna evento"
          description={
            <p className="text-sm text-on-surface-variant">
              {event
                ? "Questo evento è già stato assegnato: non c'è altro da fare."
                : "Evento non trovato: forse è stato eliminato."}
            </p>
          }
        />
        <div className="flex justify-end">
          <button type="button" className={dialogSecondaryButton} onClick={onClose}>
            Chiudi
          </button>
        </div>
      </>
    );
  }

  const start = new Date(event.scheduled_at);
  const disabled = pending || (mode === "client" && (!client || !eventType));
  const cta =
    mode === "client"
      ? "Assegna"
      : mode === "consulenza"
        ? "Segna come consulenza"
        : "Segna come personale";

  return (
    <>
      <CoachDialogHeader
        title="Assegna evento"
        description={
          <>
            <p className="text-sm text-on-surface-variant">
              {title} · {formatShortDay(start)}, {formatTimeRange(start, event.duration_min)}
            </p>
            <p className="text-xs text-outline">Importato da Google Calendar</p>
          </>
        }
      />

      <RadioGroupPrimitive.Root
        value={mode}
        onValueChange={(v) => setMode(v as Mode)}
        aria-label="Che cos'è questo evento"
        orientation="horizontal"
        className="grid grid-cols-1 gap-2 sm:grid-cols-3"
      >
        {MODES.map((m) => {
          const on = m.id === mode;
          const Icon = m.icon;
          return (
            <RadioGroupPrimitive.Item
              key={m.id}
              value={m.id}
              className={cn(
                "flex flex-col items-start gap-1 rounded-[18px] border-[1.5px] px-3.5 py-3 text-left transition-colors",
                on
                  ? "border-aura-primary bg-aura-primary/5"
                  : "border-surface-variant bg-surface-container-lowest hover:bg-surface-container-low",
              )}
            >
              <Icon
                className={cn("size-[18px]", on ? "text-aura-primary" : "text-outline")}
                aria-hidden
              />
              <span className="text-sm font-bold text-on-surface">{m.label}</span>
              <span className="text-xs leading-[1.4] text-on-surface-variant">{m.hint}</span>
            </RadioGroupPrimitive.Item>
          );
        })}
      </RadioGroupPrimitive.Root>

      {mode === "client" ? (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <p id="assign-client-label" className="text-[13px] font-bold text-on-surface">
                Cliente
              </p>
              {!pickedClientId && guessed && (
                <span className="text-xs text-outline">Suggerito dal titolo dell'evento</span>
              )}
            </div>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-3 size-4 text-outline"
                aria-hidden
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cerca per nome"
                aria-label="Cerca cliente"
                className="h-10 w-full rounded-full bg-surface-container-low pl-[38px] pr-4 text-sm outline-none placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
              />
            </div>
            <RadioGroupPrimitive.Root
              ref={listRef}
              value={clientId ?? ""}
              onValueChange={setPickedClientId}
              aria-labelledby="assign-client-label"
              className="flex max-h-[196px] flex-col gap-0.5 overflow-y-auto rounded-[18px] border border-surface-container p-1"
            >
              {visibleClients.map((c) => {
                const on = c.id === clientId;
                const name = c.full_name ?? c.email ?? "Cliente";
                return (
                  <RadioGroupPrimitive.Item
                    key={c.id}
                    value={c.id}
                    data-client-id={c.id}
                    className={cn(
                      "flex items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left transition-colors hover:bg-surface-container-low",
                      on && "bg-aura-primary/[0.06]",
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-avatar-placeholder text-xs font-bold text-on-avatar-placeholder">
                      {initials(c.full_name, c.email)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-semibold text-on-surface">{name}</span>
                      <span className="truncate text-xs text-outline">{clientPlanLabel(c)}</span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border-2 text-white",
                        on
                          ? "border-aura-primary bg-aura-primary"
                          : "border-outline-variant bg-white",
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                  </RadioGroupPrimitive.Item>
                );
              })}
              {visibleClients.length === 0 && (
                <p className="p-3 text-[13px] text-outline">Nessun cliente trovato.</p>
              )}
            </RadioGroupPrimitive.Root>
          </div>

          <div className="flex flex-col gap-2">
            <p id="assign-type-label" className="text-[13px] font-bold text-on-surface">
              Tipologia di sessione
            </p>
            <RadioGroupPrimitive.Root
              value={eventType?.id ?? ""}
              onValueChange={setPickedTypeId}
              aria-labelledby="assign-type-label"
              orientation="horizontal"
              className="flex flex-wrap gap-2"
            >
              {types.map((t) => {
                const on = t.id === eventType?.id;
                return (
                  <RadioGroupPrimitive.Item
                    key={t.id}
                    value={t.id}
                    className={cn(
                      "flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                      on
                        ? "border-aura-primary bg-aura-primary/[0.08] text-aura-primary"
                        : "border-surface-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low",
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2 rounded-full"
                      style={{ backgroundColor: t.color }}
                    />
                    {t.name}
                  </RadioGroupPrimitive.Item>
                );
              })}
            </RadioGroupPrimitive.Root>
          </div>

          <button
            type="button"
            role="checkbox"
            aria-checked={creditOn}
            disabled={!canCredit}
            onClick={() => setUseCredit((v) => !v)}
            className="flex items-start gap-3 rounded-[18px] bg-surface-container-low px-4 py-3.5 text-left disabled:cursor-default"
          >
            <span
              aria-hidden
              className={cn(
                "mt-px grid size-5 shrink-0 place-items-center rounded-md border-2 text-white",
                creditOn
                  ? "border-aura-primary bg-aura-primary"
                  : "border-outline-variant bg-white",
              )}
            >
              {creditOn && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-on-surface">
                Scala un credito dal pacchetto
              </span>
              <span className="text-xs text-on-surface-variant">{creditHint}</span>
            </span>
          </button>
        </>
      ) : (
        <p className="rounded-[18px] bg-surface-container-low px-4 py-3.5 text-sm leading-normal text-on-surface-variant">
          {OTHER_HINT[mode]}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
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
