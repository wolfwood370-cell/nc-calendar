// ----------------------------------------------------------------------------
// Tipologie di sessione, desktop (passata 07, audit E1-E5)
// ----------------------------------------------------------------------------
// Pagina di Coach Tipologie.dc.html. Le tipologie vengono da
// useCoachEventTypes (una query sola, la stessa del Calendario) e la pagina
// le ordina per nome da sé. L'uso di ogni tipologia (piè della card e dialog
// d'eliminazione) viene da event-type-usage.ts su sessioni, blocchi, clienti,
// crediti extra delle tipologie e titoli del negozio. Tutte le scritture
// passano da event-type-actions.ts, come quelle del telefono.
// ----------------------------------------------------------------------------

import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Plus, Tag } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EventTypeCard, type CardUsage } from "@/components/event-type-card";
import { EventTypeDeleteDialog } from "@/components/event-type-delete-dialog";
import { EventTypeDialog } from "@/components/event-type-dialog";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import {
  setBookable,
  stepEventType,
  undoCreate,
  undoUpdate,
  type EventTypePatch,
  type SaveResult,
  type StepField,
} from "@/lib/event-type-actions";
import { bookableToast, sortTypesByName } from "@/lib/event-type-rules";
import { supabaseEventTypeStore as store } from "@/lib/event-type-store";
import { typeUsage, type UsageData } from "@/lib/event-type-usage";
import {
  useActiveShopTitles,
  useCoachBlocks,
  useCoachBookings,
  useCoachClients,
  useCoachEventTypes,
  useTypeExtraCredits,
  type EventTypeRow,
} from "@/lib/queries";
import { queryKeys } from "@/lib/query-keys";
import { toastWithUndo } from "@/lib/toast";
import { errorMessage } from "@/lib/utils";

const CTA =
  "flex h-[42px] items-center gap-2 rounded-full bg-aura-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-container";

export function EventTypesDesktop({
  onHoldChange,
}: {
  /** Vero mentre un dialog è aperto: la route tiene montato il desktop anche se la finestra si stringe. */
  onHoldChange?: (hold: boolean) => void;
}) {
  const { user } = useAuth();
  const coachId = user?.id;
  const qc = useQueryClient();
  const typesKey = queryKeys.eventTypes.coach(coachId);

  // Rilegge all'apertura: i dialog partono dalla riga in cache.
  const typesQ = useCoachEventTypes(coachId, { fresh: true });
  const types = useMemo(() => sortTypesByName(typesQ.data ?? []), [typesQ.data]);
  const bookingsQ = useCoachBookings(coachId);
  const blocksQ = useCoachBlocks(coachId);
  const clientsQ = useCoachClients(coachId);
  const extrasQ = useTypeExtraCredits(
    coachId,
    types.map((t) => t.id),
  );
  const shopQ = useActiveShopTitles();

  const [editing, setEditing] = useState<EventTypeRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<EventTypeRow | null>(null);
  const holding = editing !== null || deleting !== null;
  useEffect(() => onHoldChange?.(holding), [holding, onHoldChange]);

  // Mentre i dati arrivano lo scheletro; se non arrivano, «Utilizzo non disponibile».
  const usageOf = useMemo((): ((t: EventTypeRow) => CardUsage) => {
    const qs = [bookingsQ, blocksQ, clientsQ, extrasQ, shopQ];
    if (qs.some((q) => q.data === undefined && q.isError)) return () => "error";
    if (!bookingsQ.data || !blocksQ.data || !clientsQ.data || !extrasQ.data || !shopQ.data) {
      return () => "loading";
    }
    const data: UsageData = {
      bookings: bookingsQ.data,
      blocks: blocksQ.data,
      clients: clientsQ.data,
      extraCredits: extrasQ.data,
      shopTitles: shopQ.data,
    };
    const now = new Date();
    return (t) => typeUsage(t, data, now);
  }, [bookingsQ, blocksQ, clientsQ, extrasQ, shopQ]);

  const refreshTypes = () => void qc.invalidateQueries({ queryKey: typesKey });

  const patchType = (id: string, patch: EventTypePatch) => {
    qc.setQueryData<EventTypeRow[]>(typesKey, (rows) =>
      rows?.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    refreshTypes();
  };

  const dropType = (id: string) => {
    qc.setQueryData<EventTypeRow[]>(typesKey, (rows) => rows?.filter((r) => r.id !== id));
    refreshTypes();
  };

  const failed = (title: string) => (e: unknown) =>
    toast.error(title, { description: errorMessage(e) });

  const writeBookable = async (t: EventTypeRow, bookable: boolean) => {
    await setBookable(store, t.id, bookable);
    patchType(t.id, { client_bookable: bookable });
    toastWithUndo(bookableToast(t.name, bookable), () => {
      setBookable(store, t.id, !bookable)
        .then(() => patchType(t.id, { client_bookable: !bookable }))
        .catch(failed("Modifica non salvata."));
    });
  };

  const writeStep = async (t: EventTypeRow, field: StepField, dir: 1 | -1) => {
    const next = await stepEventType(store, t, field, dir);
    if (next !== null) patchType(t.id, { [field]: next });
  };

  const onSaved = (result: SaveResult) => {
    if (result.kind === "created") {
      const row = result.row;
      qc.setQueryData<EventTypeRow[]>(typesKey, (rows) => (rows ? [...rows, row] : rows));
      refreshTypes();
      toastWithUndo(`Tipologia «${row.name}» creata.`, () => {
        if (!coachId) return;
        undoCreate(store, row, coachId, new Date())
          .then(() => dropType(row.id))
          .catch(failed("Tipologia non eliminata."));
      });
      return;
    }
    patchType(result.id, result.after);
    toastWithUndo("Tipologia aggiornata.", () => {
      undoUpdate(store, result)
        .then(() => patchType(result.id, result.before))
        .catch(failed("Modifica non salvata."));
    });
  };

  const onDeleted = (t: EventTypeRow) => {
    dropType(t.id);
    // Sessioni, allocazioni e crediti extra hanno perso la tipologia.
    void qc.invalidateQueries({ queryKey: queryKeys.bookings.root });
    void qc.invalidateQueries({ queryKey: queryKeys.blocks.root });
    void qc.invalidateQueries({ queryKey: queryKeys.extraCredits.root });
    toast.success(`Tipologia «${t.name}» eliminata.`);
  };

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] min-w-0 bg-surface px-10 pb-12 pt-7 text-on-surface">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[640px] flex-col gap-1.5">
            <PageTitle className="m-0">Tipologie di sessione</PageTitle>
            <p className="text-[15px] leading-normal text-on-surface-variant">
              Durata, margine, luogo e colore di ogni servizio. Calendario, pacchetti e prenotazioni
              dei clienti usano questi valori.
            </p>
          </div>
          <button type="button" className={CTA} onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden />
            Nuova tipologia
          </button>
        </div>

        {typesQ.isLoading || !coachId ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[360px] w-full rounded-[24px]" />
            ))}
          </div>
        ) : typesQ.isError && !typesQ.data ? (
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-white p-12 text-center">
            <AlertCircle className="size-8 text-danger-text" aria-hidden />
            <p className="text-sm font-semibold">Non riesco a caricare le tipologie.</p>
            <button
              type="button"
              onClick={() => void typesQ.refetch()}
              className="h-10 rounded-full bg-surface-container px-[18px] text-sm font-semibold text-on-surface-variant"
            >
              Riprova
            </button>
          </div>
        ) : types.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-white p-12 text-center">
            <Tag className="size-8 text-outline-variant" aria-hidden />
            <p className="text-base font-semibold">Nessuna tipologia di sessione.</p>
            <p className="text-sm text-on-surface-variant">
              Crea la prima per poter assegnare pacchetti e ricevere prenotazioni.
            </p>
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="h-10 rounded-full bg-aura-primary px-[18px] text-sm font-semibold text-white"
            >
              Nuova tipologia
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
              {types.map((t) => (
                <EventTypeCard
                  key={t.id}
                  type={t}
                  usage={usageOf(t)}
                  onEdit={() => setEditing(t)}
                  onDelete={() => setDeleting(t)}
                  onStep={(field, dir) => writeStep(t, field, dir)}
                  onToggle={(bookable) => writeBookable(t, bookable)}
                />
              ))}
            </div>
            <p className="text-xs text-outline">
              I pulsanti − e + e l'interruttore agiscono subito; il resto si modifica dalla matita.
              Durata e margine valgono per le sessioni fissate da ora in poi.
            </p>
          </>
        )}
      </div>

      {coachId && (
        <EventTypeDialog
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          initial={editing === "new" ? null : editing}
          coachId={coachId}
          store={store}
          types={types}
          shopTitles={shopQ.data}
          shopTitlesFailed={shopQ.data === undefined && shopQ.isError}
          onSaved={onSaved}
        />
      )}
      {coachId && (
        <EventTypeDeleteDialog
          type={deleting}
          coachId={coachId}
          store={store}
          onClose={() => setDeleting(null)}
          onMakeNotBookable={(t) => writeBookable(t, false)}
          onDeleted={onDeleted}
          onGone={(t) => {
            dropType(t.id);
            toast.error(`«${t.name}» non esiste più.`);
          }}
        />
      )}
    </div>
  );
}
