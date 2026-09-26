// ----------------------------------------------------------------------------
// «Nuova sessione» / «Nuovo impegno» / «Modifica sessione» (audit C6, passata 04)
// ----------------------------------------------------------------------------
// Dialog 560px. Creazione: segmentato «Sessione cliente | Impegno personale»,
// cliente (ricerca + elenco, archiviati esclusi come in «Assegna evento»),
// tipologia a chip (la durata la segue), oppure titolo per l'impegno; data,
// ora ogni 15 minuti (07:00–21:45), durata. Modifica: cliente bloccato, note
// del coach per le sessioni cliente.
// Il credito si controlla prima di salvare (session-create.ts): senza credito
// il dialog lo dice, non salva e offre «Pacchetto». Avvisi arancioni:
// sovrapposizione (il server la rifiuterebbe, quindi blocca) e fuori
// disponibilità (non blocca). Scritture e «Ripristina» in session-create.ts e
// session-edit.ts; toast con «Ripristina» come nella 02.
// ----------------------------------------------------------------------------

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  CoachDialog,
  CoachDialogContent,
  CoachDialogHeader,
  dialogPrimaryButton,
  dialogSecondaryButton,
} from "@/components/coach-dialog";
import { SegmentedControl } from "@/components/segmented-control";
import { removeSession } from "@/lib/cancel-session";
import { supabaseCalendarStore } from "@/lib/calendar-store";
import {
  DURATION_OPTIONS,
  OUTSIDE_AVAILABILITY_WARNING,
  findOverlap,
  isWithinAvailability,
  localDate,
  localIso,
  overlapWarning,
  timeOptions,
  type AvailabilityException,
  type AvailabilitySlot,
} from "@/lib/calendar-time";
import { clientPlanLabel, searchClients } from "@/lib/client-search";
import { toGoogleColorId } from "@/lib/gcal-colors";
import { initials } from "@/lib/initials";
import { sessionLabel, type SessionType } from "@/lib/mock-data";
import type { BookingRow, EventTypeRow, ProfileRow } from "@/lib/queries";
import { invalidateBookingScope, queryKeys } from "@/lib/query-keys";
import {
  NoCreditError,
  createClientSession,
  createCommitment,
  loadClientCredits,
  noCreditMessage,
  planSessionCredit,
} from "@/lib/session-create";
import {
  checkEditCredit,
  editSession,
  snapshotOf,
  undoEdit,
  type EditableSession,
} from "@/lib/session-edit";
import { toastWithUndo } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type FormKind = "client" | "personal";

export interface SessionFormInit {
  mode: "create" | "edit";
  kind: FormKind;
  /** Sessione da modificare. */
  booking?: BookingRow;
  clientId?: string | null;
  date: string;
  time: string;
}

export interface SessionFormDialogProps {
  init: SessionFormInit | null;
  coachId: string | undefined;
  clients: readonly ProfileRow[];
  eventTypes: readonly EventTypeRow[];
  bookings: readonly BookingRow[];
  availability: readonly AvailabilitySlot[];
  exceptions: readonly AvailabilityException[];
  onClose: () => void;
  /** Dopo il salvataggio: la sessione da selezionare e il suo giorno. */
  onSaved: (sessionId: string, date: string) => void;
  onOpenPackage: (clientId: string) => void;
}

/** «30m», «1h», «1h 30m». */
function fmtDur(m: number): string {
  if (m < 60) return `${m}m`;
  const rest = m % 60;
  return `${Math.floor(m / 60)}h${rest ? ` ${rest}m` : ""}`;
}

export function SessionFormDialog(props: SessionFormDialogProps) {
  const { init, onClose } = props;
  return (
    <CoachDialog open={!!init} onOpenChange={(o) => !o && onClose()}>
      {init && (
        <CoachDialogContent className="gap-[18px] sm:max-w-[560px]">
          <FormBody key={`${init.mode}-${init.booking?.id ?? "new"}`} {...props} init={init} />
        </CoachDialogContent>
      )}
    </CoachDialog>
  );
}

function FormBody({
  init,
  coachId,
  clients,
  eventTypes,
  bookings,
  availability,
  exceptions,
  onClose,
  onSaved,
  onOpenPackage,
}: SessionFormDialogProps & { init: SessionFormInit }) {
  const qc = useQueryClient();
  const editing = init.mode === "edit" ? (init.booking ?? null) : null;
  const [kind, setKind] = useState<FormKind>(init.kind);
  const [clientId, setClientId] = useState<string | null>(
    init.clientId ?? editing?.client_id ?? null,
  );
  const [q, setQ] = useState("");
  const [typeId, setTypeId] = useState<string | null>(
    editing?.event_type_id ?? eventTypes[0]?.id ?? null,
  );
  const [date, setDate] = useState(init.date);
  const [time, setTime] = useState(init.time);
  const firstType = eventTypes.find((t) => t.id === (editing?.event_type_id ?? eventTypes[0]?.id));
  const [duration, setDuration] = useState<number>(
    editing?.duration_min ?? (init.kind === "client" ? (firstType?.duration ?? 60) : 60),
  );
  // Aperto da un link (new=sessione) prima che arrivino le tipologie: la
  // prima, con la sua durata, appena ci sono.
  useEffect(() => {
    if (typeId || editing || !eventTypes[0]) return;
    setTypeId(eventTypes[0].id);
    if (init.kind === "client") setDuration(eventTypes[0].duration);
  }, [typeId, editing, eventTypes, init.kind]);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [notes, setNotes] = useState(editing?.trainer_notes ?? "");
  const [saving, setSaving] = useState(false);

  const isClient = kind === "client";
  const type = eventTypes.find((t) => t.id === typeId) ?? null;
  const client = clients.find((c) => c.id === clientId) ?? null;
  const clientName = client?.full_name ?? client?.email ?? "Cliente";
  const start = useMemo(() => (date && time ? new Date(`${date}T${time}:00`) : null), [date, time]);
  const startIso = start && !Number.isNaN(start.getTime()) ? localIso(date, time) : null;

  // Sessione da modificare com'è adesso sul server (per il controllo del credito e lo stato).
  const editQ = useQuery({
    queryKey: ["calendar-edit-session", editing?.id],
    enabled: !!editing,
    queryFn: () => supabaseCalendarStore.getEditableSession(editing!.id),
  });
  const current: EditableSession | null = editQ.data ?? null;
  const locked = !!editing && isClient && !!current && current.status !== "scheduled";

  // Crediti del cliente per la creazione.
  const creditsQ = useQuery({
    queryKey: ["calendar-client-credits", clientId],
    enabled: !editing && isClient && !!clientId,
    queryFn: () => loadClientCredits(supabaseCalendarStore, clientId!),
  });
  const creditProblem = useMemo(() => {
    if (editing || !isClient || !client || !type || !startIso || !creditsQ.data) return null;
    const plan = planSessionCredit({
      scheduledAt: startIso,
      eventTypeId: type.id,
      sessionType: type.base_type as SessionType,
      ...creditsQ.data,
    });
    return plan ? null : noCreditMessage(clientName, type.name);
  }, [editing, isClient, client, type, startIso, creditsQ.data, clientName]);

  // Cambio di tipologia in modifica: serve un credito della tipologia nuova.
  const retypeQ = useQuery({
    queryKey: ["calendar-edit-credit", editing?.id, typeId, startIso],
    enabled:
      !!editing &&
      isClient &&
      !!current &&
      !!type &&
      type.id !== current.event_type_id &&
      !!startIso,
    queryFn: () =>
      checkEditCredit(supabaseCalendarStore, current!, {
        scheduledAt: startIso!,
        type: { id: type!.id, name: type!.name, base_type: type!.base_type as SessionType },
        clientName,
      }),
  });
  const retypeProblem = retypeQ.data ?? null;

  const overlap = useMemo(() => {
    if (!start || Number.isNaN(start.getTime())) return null;
    const buffer = isClient ? (type?.buffer_minutes ?? 0) : 0;
    return findOverlap(bookings, start, duration, buffer, editing?.id);
  }, [bookings, start, duration, isClient, type, editing]);
  const overlapName = (b: BookingRow) =>
    b.client_id && b.client_id !== b.coach_id
      ? (clients.find((c) => c.id === b.client_id)?.full_name ?? "un cliente")
      : b.title?.trim() || "un evento";
  const outside =
    isClient &&
    !!start &&
    !Number.isNaN(start.getTime()) &&
    !isWithinAvailability(start, duration, availability, exceptions);

  const visibleClients = useMemo(() => {
    const active = clients.filter((c) => c.status !== "archived");
    return q.trim() ? searchClients(active, q, 50) : active;
  }, [clients, q]);
  // Cliente già scelto dal link (client=<id>): visibile nell'elenco.
  const clientListRef = useRef<HTMLDivElement>(null);
  const preselected = init.clientId ?? null;
  useEffect(() => {
    if (!preselected) return;
    clientListRef.current
      ?.querySelector(`[data-client-id="${preselected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [preselected, visibleClients.length]);

  const times = useMemo(() => {
    const list = timeOptions();
    return list.includes(time) ? list : [...list, time].sort();
  }, [time]);
  const durations = useMemo(() => {
    const list: number[] = [...DURATION_OPTIONS];
    return list.includes(duration) ? list : [...list, duration].sort((a, b) => a - b);
  }, [duration]);

  const valid =
    !!startIso &&
    (isClient ? !!client && !!type : title.trim().length > 0) &&
    !overlap &&
    !creditProblem &&
    !retypeProblem &&
    !(isClient && !editing && creditsQ.isLoading);

  const heading = editing
    ? isClient
      ? "Modifica sessione"
      : "Modifica impegno"
    : isClient
      ? "Nuova sessione"
      : "Nuovo impegno";
  const cta = editing ? "Salva modifiche" : isClient ? "Crea sessione" : "Crea impegno";

  function refresh(cId: string | null) {
    invalidateBookingScope(qc, { coachId, clientId: cId });
    void qc.invalidateQueries({ queryKey: queryKeys.blocks.coach(coachId) });
    void qc.invalidateQueries({ queryKey: queryKeys.clients.coach(coachId) });
    void qc.invalidateQueries({ queryKey: ["calendar-client-credits"] });
  }

  async function submit() {
    if (!valid || !startIso || !coachId) return;
    setSaving(true);
    try {
      if (!editing) {
        const r = isClient
          ? await createClientSession(supabaseCalendarStore, {
              coachId,
              clientId: client!.id,
              clientName,
              type: { id: type!.id, name: type!.name, base_type: type!.base_type as SessionType },
              scheduledAt: startIso,
              durationMin: duration,
            })
          : await createCommitment(supabaseCalendarStore, {
              coachId,
              title,
              scheduledAt: startIso,
              durationMin: duration,
            });
        refresh(isClient ? client!.id : null);
        const what = isClient ? "Sessione" : "Impegno";
        toastWithUndo(isClient ? `Sessione creata per ${clientName}.` : "Impegno creato.", () => {
          void removeSession(supabaseCalendarStore, { sessionId: r.sessionId, removal: "delete" })
            .then(() => {
              refresh(isClient ? client!.id : null);
              toast.success(`${what} eliminat${isClient ? "a" : "o"}.`);
            })
            .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));
        });
        if (!r.googleEventCreated) {
          toast.warning(
            `${what} salvat${isClient ? "a" : "o"}, ma non è su Google Calendar: la trovi fra quelle da ricreare.`,
          );
        }
        onSaved(r.sessionId, date);
        return;
      }
      if (!current) throw new Error("La sessione non è più disponibile.");
      const typeForEdit =
        isClient && type
          ? { id: type.id, name: type.name, base_type: type.base_type as SessionType }
          : null;
      const googleSummary = isClient
        ? `${type?.name ?? sessionLabel(current.session_type)} — ${clientName}`
        : title.trim() || "Impegno";
      const r = await editSession(supabaseCalendarStore, {
        sessionId: current.id,
        expected: snapshotOf(current),
        scheduledAt: startIso,
        durationMin: duration,
        type: typeForEdit,
        clientName,
        notes: isClient ? notes : undefined,
        title: isClient ? undefined : title,
        google: { summary: googleSummary, colorId: toGoogleColorId(type?.color) },
      });
      refresh(current.client_id);
      const beforeType = eventTypes.find((t) => t.id === r.before.event_type_id);
      const beforeSummary = isClient
        ? `${beforeType?.name ?? sessionLabel(r.before.session_type)} — ${clientName}`
        : r.before.title || "Impegno";
      toastWithUndo("Modifiche salvate.", () => {
        void undoEdit(supabaseCalendarStore, r, {
          summary: beforeSummary,
          colorId: toGoogleColorId(beforeType?.color),
        })
          .then(() => {
            refresh(current.client_id);
            toast.success(isClient ? "Sessione ripristinata." : "Impegno ripristinato.");
          })
          .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));
      });
      if (r.refundFailed)
        toast.error("Il credito della tipologia di prima non è stato restituito.");
      if (r.googleEventId && !r.googleUpdated) {
        toast.warning("L'evento non è stato aggiornato su Google Calendar.");
      }
      onSaved(current.id, localDate(new Date(r.after.scheduled_at)));
    } catch (e) {
      toast.error(
        e instanceof NoCreditError || e instanceof Error ? e.message : "Salvataggio non riuscito.",
      );
    } finally {
      setSaving(false);
    }
  }

  const warnings: string[] = [];
  if (overlap) {
    warnings.push(
      `${overlapWarning(overlapName(overlap), overlap)} Due eventi programmati non possono sovrapporsi: scegli un altro orario.`,
    );
  } else if (outside) {
    warnings.push(OUTSIDE_AVAILABILITY_WARNING);
  }
  const showDurationNote =
    !editing && isClient && !!type && duration === 60 && type.duration !== 60;

  return (
    <>
      <CoachDialogHeader title={heading} />

      {!editing && (
        <SegmentedControl
          ariaLabel="Tipo di evento"
          className="self-start"
          value={kind}
          onChange={(k) => {
            setKind(k);
            if (k === "personal") setDuration(60);
            else if (type) setDuration(type.duration);
          }}
          options={[
            { value: "client", label: "Sessione cliente" },
            { value: "personal", label: "Impegno personale" },
          ]}
        />
      )}

      {isClient ? (
        <>
          <div className="flex flex-col gap-2">
            <p id="form-client-label" className="text-[13px] font-bold text-on-surface">
              Cliente
            </p>
            {editing ? (
              <div className="flex items-center gap-2.5 rounded-2xl bg-surface-container-low px-3 py-2.5">
                <span className="grid size-8 place-items-center rounded-full bg-avatar-placeholder text-xs font-bold text-on-avatar-placeholder">
                  {initials(client?.full_name ?? null, client?.email ?? null)}
                </span>
                <span className="text-sm font-semibold text-on-surface">{clientName}</span>
              </div>
            ) : (
              <>
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
                  ref={clientListRef}
                  value={clientId ?? ""}
                  onValueChange={setClientId}
                  aria-labelledby="form-client-label"
                  className="flex max-h-[176px] flex-col gap-0.5 overflow-y-auto rounded-[18px] border border-surface-container p-1"
                >
                  {visibleClients.map((c) => {
                    const on = c.id === clientId;
                    return (
                      <RadioGroupPrimitive.Item
                        key={c.id}
                        value={c.id}
                        data-client-id={c.id}
                        className={cn(
                          "flex items-center gap-2.5 rounded-[14px] px-2.5 py-[7px] text-left transition-colors hover:bg-surface-container-low",
                          on && "bg-aura-primary/[0.06]",
                        )}
                      >
                        <span className="grid size-[30px] shrink-0 place-items-center rounded-full bg-avatar-placeholder text-xs font-bold text-on-avatar-placeholder">
                          {initials(c.full_name, c.email)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm font-semibold text-on-surface">
                            {c.full_name ?? c.email ?? "Cliente"}
                          </span>
                          <span className="truncate text-xs text-outline">
                            {clientPlanLabel(c)}
                          </span>
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
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <p id="form-type-label" className="text-[13px] font-bold text-on-surface">
              Tipologia di sessione
            </p>
            <RadioGroupPrimitive.Root
              value={typeId ?? ""}
              onValueChange={(id) => {
                setTypeId(id);
                const t = eventTypes.find((x) => x.id === id);
                if (!editing && t) setDuration(t.duration);
              }}
              disabled={locked}
              aria-labelledby="form-type-label"
              orientation="horizontal"
              className="flex flex-wrap gap-2"
            >
              {eventTypes.map((t) => {
                const on = t.id === typeId;
                return (
                  <RadioGroupPrimitive.Item
                    key={t.id}
                    value={t.id}
                    className={cn(
                      "flex h-[34px] items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors disabled:opacity-60",
                      on
                        ? "border-aura-primary bg-aura-primary/[0.08] text-aura-primary"
                        : "border-surface-variant bg-white text-on-surface-variant hover:bg-surface-container-low",
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
        </>
      ) : (
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-on-surface">Titolo</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Es. Allenamento personale"
            className="h-[42px] rounded-[14px] bg-surface-container-low px-3.5 text-sm outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
          />
        </label>
      )}

      <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2.5">
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-on-surface">Data</span>
          <input
            type="date"
            value={date}
            disabled={locked}
            onChange={(e) => setDate(e.target.value)}
            className="h-[42px] rounded-[14px] bg-surface-container-low px-3 text-sm outline-none disabled:opacity-60"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-on-surface">Ora</span>
          <select
            value={time}
            disabled={locked}
            onChange={(e) => setTime(e.target.value)}
            className="h-[42px] rounded-[14px] bg-surface-container-low px-2.5 text-sm outline-none disabled:opacity-60"
          >
            {times.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-on-surface">Durata</span>
          <select
            value={String(duration)}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="h-[42px] rounded-[14px] bg-surface-container-low px-2.5 text-sm outline-none"
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {fmtDur(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {showDurationNote && (
        <p className="-mt-2 text-xs text-outline">
          Con 1h il server salva la durata della tipologia ({fmtDur(type!.duration)}).
        </p>
      )}
      {locked && (
        <p className="-mt-2 text-xs text-outline">
          La sessione non è più programmata: si possono cambiare solo durata e note.
        </p>
      )}

      {warnings.map((w) => (
        <p
          key={w}
          role="status"
          className="flex items-start gap-2 rounded-[14px] bg-warning-soft px-3 py-2.5 text-[13px] leading-[1.45] text-warning-text"
        >
          <TriangleAlert className="mt-0.5 size-[15px] shrink-0" aria-hidden />
          {w}
        </p>
      ))}
      {(creditProblem || retypeProblem) && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-[14px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger-text"
        >
          <span>{creditProblem ?? retypeProblem}</span>
          {client && (
            <button
              type="button"
              onClick={() => onOpenPackage(client.id)}
              className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-aura-primary"
            >
              Pacchetto
            </button>
          )}
        </div>
      )}

      {editing && isClient && (
        <label className="flex flex-col gap-2">
          <span className="text-[13px] font-bold text-on-surface">Note del coach</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Il cliente le vede nel dettaglio della sessione."
            className="resize-y rounded-[14px] bg-surface-container-low px-3.5 py-2.5 text-sm leading-normal outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
          />
        </label>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={dialogSecondaryButton}>
          Annulla
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!valid || saving || (!!editing && !current)}
          className={dialogPrimaryButton}
        >
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {cta}
        </button>
      </div>
    </>
  );
}
