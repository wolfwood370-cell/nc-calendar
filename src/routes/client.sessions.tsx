// ----------------------------------------------------------------------------
// Sessioni (lato cliente, passata 03, audit N1, T1, T5, H9 e V13)
// ----------------------------------------------------------------------------
// Due schede, «In programma» e «Passate», con la scelta nell'URL (`tab`,
// cambiata con replace: nessuna voce nuova nella cronologia, e resta dopo un
// ricaricamento). Ogni sessione visibile sta in una scheda sola ed è un
// pulsante verso il suo dettaglio, senza replace: «Indietro» torna qui con la
// stessa scheda. Ogni numero, testo e gruppo viene da client-sessions.ts; le
// sessioni, le tipologie e i crediti della card vuota da useClientBookState,
// lo stesso di Prenota (le sessioni con le annullate tardi, e le incoerenze
// dei crediti le manda lui); i voti da useClientFeedback, con la chiave della
// cornice.
// Gli stati, nell'ordine: sessioni perse (la card dell'errore, mai «Nessuna
// sessione…» per una lettura che non è arrivata, né qui né nell'intestazione);
// elenco non pronto (lo scheletro); l'elenco della scheda, o la sua card vuota.
// Al cambio di scheda la pagina torna in cima: l'altro elenco comincia da lì.
// ----------------------------------------------------------------------------

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { BookRetryCard } from "@/components/book-blocked-card";
import { ClientButton } from "@/components/client-button";
import { ClientSessionRow } from "@/components/client-session-row";
import { ClientTabHeader } from "@/components/client-tab-header";
import { SegmentedControl } from "@/components/segmented-control";
import { AuraLineSkeleton, AuraSkeleton } from "@/components/ui/aura-skeleton";
import { useClientBookState } from "@/hooks/use-client-book-state";
import { useClientShell } from "@/hooks/use-client-shell";
import { useMyCoach } from "@/hooks/use-my-coach";
import { useClientFeedback } from "@/hooks/use-session-feedback";
import {
  attendanceSummary,
  parseSessionsTab,
  pastGroups,
  ratingsById,
  sessionRow,
  splitSessions,
  upcomingEmpty,
  upcomingGroups,
  upcomingTabLabel,
  type SessionRowModel,
  type SessionsTab,
} from "@/lib/client-sessions";
import { clientPageTitle, sessionsSubtitle } from "@/lib/client-shell";
import type { EventTypeRow } from "@/lib/queries";
import { arrivedRead, lostRead } from "@/lib/query-state";
import { cn } from "@/lib/utils";

const DESCRIPTION = "Le tue sessioni, in programma e passate.";

export const Route = createFileRoute("/client/sessions")({
  head: () => ({
    meta: [
      { title: clientPageTitle("Sessioni") },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: clientPageTitle("Sessioni") },
      { property: "og:description", content: DESCRIPTION },
    ],
  }),
  // Solo «prossime» e «passate»; senza (o con altro) la pagina apre su
  // «prossime», e i link a /client/sessions senza search restano validi.
  validateSearch: (search: Record<string, unknown>): { tab?: SessionsTab } => {
    const tab = parseSessionsTab(search.tab);
    return tab ? { tab } : {};
  },
  component: ClientSessionsPage,
});

const NO_EVENT_TYPES: EventTypeRow[] = [];

const CARD = "flex flex-col gap-3 rounded-[24px] border border-outline-variant/35 bg-white p-5";

interface RowGroup {
  key: string;
  label: string;
  rows: SessionRowModel[];
}

function ClientSessionsPage() {
  const { now } = useClientShell();
  const navigate = useNavigate();
  const tab = Route.useSearch({ select: (s) => s.tab }) ?? "prossime";

  // Il coach dei testi (get_my_coach): qui entra nella card vuota, tramite lo stato dei crediti.
  const { coach } = useMyCoach();
  const { meId, coachId, profileArrived, bookingsQ, eventTypesQ, failed, state } =
    useClientBookState(now, coach);
  const feedbackQ = useClientFeedback(meId);

  // Persa: in errore e senza dati. Una rilettura fallita coi dati di prima
  // tiene l'elenco (TanStack Query tiene i dati). Rileggendo una lettura
  // senza dati (con «Riprova», o tornando sulla finestra) TanStack Query la
  // rimette in attesa e ne toglie l'errore: errorUpdateCount ricorda che era
  // fallita, e finché risponde resta la card, con «Riprova» occupato.
  const reading = bookingsQ.fetchStatus !== "idle";
  const sessionsLost = lostRead(bookingsQ);
  // Pronto: le sessioni, il profilo (fino a lì coachId è nullo anche per chi
  // ha un coach; arrivato con l'errore lo resta) e, con un coach, le
  // tipologie arrivate, coi dati o in errore: in errore i nomi ripiegano sul
  // tipo di sessione. Arrivate anche mentre una lettura fallita si rilegge.
  const typesArrived = arrivedRead(eventTypesQ);
  const ready =
    bookingsQ.data !== undefined && profileArrived && (coachId === null || typesArrived);

  const eventTypes = eventTypesQ.data ?? NO_EVENT_TYPES;
  const ratings = useMemo(() => ratingsById(feedbackQ.data), [feedbackQ.data]);
  const lists = useMemo(
    () => (bookingsQ.data ? splitSessions(bookingsQ.data, now) : null),
    [bookingsQ.data, now],
  );
  const groups = useMemo<RowGroup[]>(() => {
    if (!lists) return [];
    const byTab = tab === "passate" ? pastGroups(lists.past) : upcomingGroups(lists.upcoming, now);
    return byTab.map((g) => ({
      key: g.key,
      label: g.label,
      rows: g.items.map((b) => sessionRow(b, eventTypes, ratings, now)),
    }));
  }, [lists, tab, eventTypes, ratings, now]);
  const attendance = useMemo(
    () => (tab === "passate" && bookingsQ.data ? attendanceSummary(bookingsQ.data, now) : null),
    [tab, bookingsQ.data, now],
  );

  const upcomingN = ready && lists ? lists.upcoming.length : null;

  const chooseTab = (next: SessionsTab) => {
    void navigate({ to: "/client/sessions", search: { tab: next }, replace: true });
  };
  const open = (bookingId: string) => {
    void navigate({ to: "/client/bookings/$bookingId", params: { bookingId } });
  };
  const lostTitleRef = useRef<HTMLHeadingElement>(null);
  const retried = useRef(false);
  const retrySessions = () => {
    retried.current = true;
    void bookingsQ.refetch();
    if (coachId) void eventTypesQ.refetch();
  };
  // Mentre rilegge il focus resta su «Riprova» (aria-disabled, non disabled:
  // il browser non glielo toglie). Se la rilettura fallisce di nuovo lo prende
  // il titolo della card, che lo annuncia.
  useEffect(() => {
    if (!retried.current || reading) return;
    retried.current = false;
    if (sessionsLost) lostTitleRef.current?.focus();
  }, [reading, sessionsLost]);

  let content: ReactNode;
  if (sessionsLost) {
    content = (
      <BookRetryCard
        title="Sessioni non caricate"
        text="Non siamo riusciti a leggere le tue sessioni. Riprova tra poco."
        onRetry={retrySessions}
        retrying={reading || eventTypesQ.isFetching}
        titleRef={lostTitleRef}
      />
    );
  } else if (!ready) {
    content = <SessionsSkeleton />;
  } else if (tab === "prossime") {
    if (groups.length > 0) {
      content = <SessionGroups groups={groups} onOpen={open} />;
    } else {
      const empty = upcomingEmpty(state, failed);
      content = (
        <section className={CARD}>
          <h2 className="text-[17px] font-bold">Nessuna sessione in programma</h2>
          {empty.text ? (
            <p className="text-[15px] leading-normal text-on-surface-variant">{empty.text}</p>
          ) : (
            // Lo stato dei crediti carica ancora; con la lettura fallita, niente.
            !failed && <AuraLineSkeleton className="w-4/5" aria-busy="true" />
          )}
          {empty.book && (
            <ClientButton asChild fullWidth>
              <Link to="/client/book">Prenota una sessione</Link>
            </ClientButton>
          )}
        </section>
      );
    }
  } else {
    content = (
      <>
        {attendance && (
          <div className="flex items-center gap-3 rounded-[18px] border border-outline-variant/35 bg-white px-4 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-success-soft text-success-text">
              <TrendingUp className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-0.5">
              <p className="text-[15px] font-bold">{attendance.title}</p>
              <p className="text-[13px] text-on-surface-variant">{attendance.sub}</p>
            </div>
          </div>
        )}
        {groups.length > 0 ? (
          <SessionGroups groups={groups} onOpen={open} />
        ) : (
          <section className={CARD}>
            <h2 className="text-[17px] font-bold">Nessuna sessione passata</h2>
            <p className="text-[15px] leading-normal text-on-surface-variant">
              Qui trovi le sessioni svolte, le assenze e quelle annullate.
            </p>
          </section>
        )}
      </>
    );
  }

  return (
    <div>
      <ClientTabHeader
        title="Sessioni"
        subtitle={upcomingN === null ? null : sessionsSubtitle(upcomingN)}
      >
        <SegmentedControl
          kind="tabs"
          appearance="plain"
          ariaLabel="Sessioni"
          value={tab}
          onChange={chooseTab}
          options={[
            { value: "prossime", label: upcomingTabLabel(upcomingN) },
            { value: "passate", label: "Passate" },
          ]}
          className="grid grid-cols-2 gap-1 rounded-full bg-surface-container p-1"
          itemClassName={(checked) =>
            cn(
              "h-11 rounded-full text-sm font-bold transition-colors",
              checked
                ? "bg-white text-aura-primary shadow-[0_2px_8px_rgba(0,0,0,0.08)]"
                : "text-on-surface-variant",
            )
          }
        />
      </ClientTabHeader>
      <div className="flex flex-col gap-5 px-4 pt-2 pb-6">{content}</div>
    </div>
  );
}

/** I gruppi della scheda: il titolo del gruppo e le sue righe, in colonna. */
function SessionGroups({ groups, onOpen }: { groups: RowGroup[]; onOpen: (id: string) => void }) {
  return groups.map((g) => (
    <section key={g.key} className="flex flex-col gap-2">
      <h2 className="px-1 text-sm font-bold text-on-surface-variant">{g.label}</h2>
      {g.rows.map((row) => (
        <ClientSessionRow key={row.id} row={row} onOpen={onOpen} />
      ))}
    </section>
  ));
}

/** Il caricamento: tre righe alte quanto quelle vere. */
function SessionsSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <AuraSkeleton key={i} className="h-[72px] rounded-[18px]" />
      ))}
    </div>
  );
}
