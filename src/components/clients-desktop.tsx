// ----------------------------------------------------------------------------
// Lista Clienti desktop (passata 05 del redesign)
// ----------------------------------------------------------------------------
// Brief design_handoff_coach_redesign/passes/05-clienti.md, prototipo
// designs/Coach Clienti.dc.html. Il telefono (block md:hidden in
// trainer.clients.index.tsx) resta com'era.
//   - Un solo «Nuovo cliente» (L1); tab con «Completati» (L2); ricerca per
//     nome, email o telefono; cinque ordinamenti (L7); schede o tabella.
//   - Inviti in attesa nel tab Tutti, con «Reinvia» e «Annulla invito» (L5).
//   - Tutta la scheda apre il profilo (L3); il ⋮ no (L6).
//   - Crediti del blocco in corso (L8), presenza di getAttendance (V5).
//   - Stato nell'URL (T4); il Profilo riporta alla lista con gli stessi
//     parametri (client-list.ts, backToListSearch).
// ----------------------------------------------------------------------------

import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarDays, LayoutGrid, List, Mail, Search, UserPlus, UserSearch } from "lucide-react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ClientRowMenu } from "@/components/client-row-menu";
import { DeleteClientDialog } from "@/components/delete-client-dialog";
import {
  NewClientDialog,
  type InviteInput,
  type NewClientMode,
} from "@/components/new-client-dialog";
import { PageTitle } from "@/components/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { clientPlanLabel } from "@/lib/client-search";
import type { CreateClientResult, NewClientPayload } from "@/lib/client-create";
import {
  clientsSearchOf,
  clientsState,
  filterRows,
  SORT_LABEL,
  sortRows,
  STATUS_LABEL,
  TAB_LABEL,
  CLIENT_SORTS,
  CLIENT_TABS,
  tabCounts,
  withoutNewParam,
  type ClientRow,
  type ClientSort,
  type ClientsListState,
  type ClientsSearch,
  type ClientStatus,
} from "@/lib/client-list";
import { initials } from "@/lib/initials";
import type { EventTypeRow } from "@/lib/queries";
import { cn } from "@/lib/utils";

export interface PendingInvitation {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  /** «inviato 3 giorni fa». */
  sent: string;
}

export interface ClientsDesktopProps {
  loading: boolean;
  rows: readonly ClientRow[];
  invitations: readonly PendingInvitation[];
  eventTypes: readonly EventTypeRow[];
  onResendInvite: (inv: PendingInvitation) => void;
  onCancelInvite: (inv: PendingInvitation) => void;
  onInvite: (data: InviteInput) => Promise<boolean>;
  onCreate: (payload: NewClientPayload) => Promise<CreateClientResult>;
  onToggleArchive: (row: ClientRow) => void;
  onDelete: (row: ClientRow) => Promise<void>;
}

const STATUS_CHIP: Record<ClientStatus, string> = {
  active: "bg-success-soft text-success-text",
  expiring: "bg-warning-soft text-warning-text",
  completed: "bg-surface-container text-on-surface-variant",
  archived: "bg-surface-container text-on-surface-variant",
};

function attendanceColor(pct: number | null): string {
  if (pct === null) return "text-outline";
  return pct >= 80 ? "text-success-text" : pct >= 60 ? "text-warning-text" : "text-danger-text";
}

/** «sab 26 set · 18:00». */
function fmtNextSession(ms: number | null): string {
  if (!ms) return "Nessuna sessione in agenda";
  const d = new Date(ms);
  const day = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
  const time = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

function nameOf(r: ClientRow): string {
  return r.client.full_name ?? r.client.email ?? "Cliente";
}

/** Il desktop è montato anche sul telefono (nascosto): `new=cliente` vale solo da md in su. */
function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => setDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return desktop;
}

export function ClientsDesktop(p: ClientsDesktopProps) {
  const navigate = useNavigate();
  const search = useSearch({ from: "/trainer/clients/" });
  const st = clientsState(search);
  const isDesktop = useIsDesktop();
  const [dialog, setDialog] = useState<NewClientMode | null>(null);
  const [deleting, setDeleting] = useState<ClientRow | null>(null);
  // La ricerca si scrive subito nel campo e nell'URL senza voci di cronologia.
  const [q, setQ] = useState(st.q);
  useEffect(() => setQ(st.q), [st.q]);

  const setState = (patch: Partial<ClientsListState>) => {
    const next = clientsSearchOf({ ...st, ...patch });
    void navigate({
      to: "/trainer/clients",
      search: (prev: Record<string, unknown>) => ({ ...prev, ...next }),
      replace: true,
    });
  };

  // new=cliente (menu «Nuovo» dell'header) apre la scelta, poi si toglie.
  useEffect(() => {
    if (!isDesktop || search.new !== "cliente") return;
    setDialog("choice");
    void navigate({
      to: "/trainer/clients",
      search: (prev: Record<string, unknown>) => withoutNewParam(prev as ClientsSearch),
      replace: true,
    });
  }, [isDesktop, search.new, navigate]);

  const counts = useMemo(() => tabCounts(p.rows), [p.rows]);
  const visible = useMemo(
    () => sortRows(filterRows(p.rows, st.tab, q), st.sort),
    [p.rows, st.tab, st.sort, q],
  );
  const invitations = useMemo(() => {
    const term = q.trim().toLowerCase();
    return p.invitations.filter(
      (i) =>
        !term ||
        (i.full_name ?? "").toLowerCase().includes(term) ||
        i.email.toLowerCase().includes(term),
    );
  }, [p.invitations, q]);

  function openProfile(id: string) {
    void navigate({
      to: "/trainer/clients/$id",
      params: { id },
      state: (prev) => ({ ...prev, clientsSearch: clientsSearchOf({ ...st, q }) }),
    });
  }
  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openProfile(id);
    }
  };

  const emptyMsg = q.trim()
    ? `Nessun cliente corrisponde a «${q.trim()}».`
    : {
        all: "Nessun cliente ancora. Crea il primo con «Nuovo cliente».",
        active: "Nessun cliente attivo.",
        expiring: "Nessun cliente in scadenza.",
        completed: "Nessun percorso completato.",
        archived: "Nessun cliente archiviato.",
      }[st.tab];

  return (
    <div className="-m-6 min-h-[calc(100vh-3.5rem)] min-w-0 bg-surface px-10 pb-12 pt-7 text-on-surface">
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <PageTitle className="m-0">Clienti</PageTitle>
          <button
            type="button"
            onClick={() => setDialog("choice")}
            className="flex h-[42px] items-center gap-2 rounded-full bg-aura-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-container"
          >
            <UserPlus className="size-4" aria-hidden />
            Nuovo cliente
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Stato"
          className="flex w-fit flex-wrap rounded-full bg-surface-container p-[3px]"
        >
          {CLIENT_TABS.map((t) => {
            const on = st.tab === t;
            return (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setState({ tab: t })}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors",
                  on
                    ? "bg-white text-aura-primary shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
                    : "text-on-surface-variant",
                )}
              >
                {TAB_LABEL[t]}
                <span
                  className={cn(
                    "tabular-nums",
                    t === "expiring" && counts.expiring > 0 ? "text-warning-text" : "text-outline",
                  )}
                >
                  {counts[t]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative max-w-[420px] flex-[1_1_280px]">
            <Search
              className="pointer-events-none absolute left-3.5 top-3 size-4 text-outline"
              aria-hidden
            />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setState({ q: e.target.value });
              }}
              placeholder="Cerca per nome, email o telefono"
              aria-label="Cerca clienti"
              className="h-10 w-full rounded-full border border-surface-variant bg-white pl-[38px] pr-4 text-sm outline-none focus:border-primary-container focus:ring-[3px] focus:ring-primary-container/15"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <label className="flex items-center gap-2 text-[13px] text-on-surface-variant">
              Ordina per
              <select
                value={st.sort}
                onChange={(e) => setState({ sort: e.target.value as ClientSort })}
                className="h-9 rounded-full border border-surface-variant bg-white px-3 text-[13px] font-semibold text-on-surface"
              >
                {CLIENT_SORTS.map((s) => (
                  <option key={s} value={s}>
                    {SORT_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <div
              role="radiogroup"
              aria-label="Vista"
              className="flex rounded-full bg-surface-container p-[3px]"
            >
              {(
                [
                  ["grid", "Vista a schede", LayoutGrid],
                  ["table", "Vista tabella", List],
                ] as const
              ).map(([v, label, Icon]) => {
                const on = st.view === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={label}
                    onClick={() => setState({ view: v })}
                    className={cn(
                      "grid h-8 w-[38px] place-items-center rounded-full",
                      on
                        ? "bg-white text-aura-primary shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                        : "text-outline",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {st.tab === "all" && invitations.length > 0 && (
          <section
            aria-labelledby="pending-invites"
            className="flex flex-col gap-2.5 rounded-[24px] border border-dashed border-outline-variant bg-white px-5 py-4"
          >
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-aura-primary" aria-hidden />
              <h2 id="pending-invites" className="text-[15px] font-bold">
                Inviti in attesa
              </h2>
              <span className="text-[13px] text-outline">{invitations.length}</span>
            </div>
            {invitations.map((i) => {
              const name = i.full_name?.trim() || i.email;
              return (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-3.5 border-t border-surface-container-low py-2.5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-outline-variant text-xs font-bold text-outline">
                    {initials(i.full_name, i.email)}
                  </span>
                  <div className="flex min-w-0 flex-[1_1_220px] flex-col">
                    <span className="text-sm font-semibold">{name}</span>
                    <span className="text-xs text-outline">
                      {i.email} · {i.sent}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => p.onResendInvite(i)}
                      className="h-[34px] rounded-full border border-surface-variant px-3.5 text-[13px] font-semibold text-aura-primary transition-colors hover:border-primary-container"
                    >
                      Reinvia
                    </button>
                    <button
                      type="button"
                      onClick={() => p.onCancelInvite(i)}
                      className="h-[34px] rounded-full px-3.5 text-[13px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
                    >
                      Annulla invito
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {p.loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[196px] rounded-[24px]" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[24px] bg-white p-10 text-center">
            <UserSearch className="size-8 text-outline-variant" aria-hidden />
            <p className="text-[15px] font-semibold text-on-surface-variant">{emptyMsg}</p>
            {q.trim() && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setState({ q: "" });
                }}
                className="text-sm font-semibold text-aura-primary"
              >
                Cancella la ricerca
              </button>
            )}
          </div>
        ) : st.view === "grid" ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {visible.map((r) => (
              <ClientCard
                key={r.client.id}
                row={r}
                onOpen={() => openProfile(r.client.id)}
                onKeyDown={onKey(r.client.id)}
                menu={
                  <ClientRowMenu
                    archived={r.status === "archived"}
                    onOpen={() => openProfile(r.client.id)}
                    onArchive={() => p.onToggleArchive(r)}
                    onDelete={() => setDeleting(r)}
                  />
                }
              />
            ))}
          </div>
        ) : (
          <ClientsTable
            rows={visible}
            onOpen={openProfile}
            onKey={onKey}
            menuFor={(r) => (
              <ClientRowMenu
                archived={r.status === "archived"}
                onOpen={() => openProfile(r.client.id)}
                onArchive={() => p.onToggleArchive(r)}
                onDelete={() => setDeleting(r)}
              />
            )}
          />
        )}
      </div>

      <NewClientDialog
        mode={dialog}
        onModeChange={setDialog}
        eventTypes={p.eventTypes}
        onInvite={async (data) => {
          const ok = await p.onInvite(data);
          if (ok && st.tab !== "all") setState({ tab: "all" });
          return ok;
        }}
        onCreate={p.onCreate}
        onOpenProfile={(id) => {
          setDialog(null);
          openProfile(id);
        }}
      />

      <DeleteClientDialog
        client={deleting ? { id: deleting.client.id, name: nameOf(deleting) } : null}
        onClose={() => setDeleting(null)}
        onArchive={() => {
          const r = deleting;
          setDeleting(null);
          if (r && r.status !== "archived") p.onToggleArchive(r);
        }}
        onDelete={async () => {
          if (!deleting) return;
          await p.onDelete(deleting);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function CreditsBar({ row, className }: { row: ClientRow; className?: string }) {
  const c = row.credits;
  if (!c) return null;
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-container", className)}>
      <div
        className={cn(
          "h-full rounded-full",
          row.status === "expiring" ? "bg-warning-strong" : "bg-aura-primary",
        )}
        style={{ width: `${c.total ? Math.round((c.left / c.total) * 100) : 0}%` }}
      />
    </div>
  );
}

function ClientCard({
  row,
  onOpen,
  onKeyDown,
  menu,
}: {
  row: ClientRow;
  onOpen: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
  menu: React.ReactNode;
}) {
  const c = row.client;
  const name = nameOf(row);
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Apri il profilo di ${name}`}
      data-client-card={c.id}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      className={cn(
        "relative flex cursor-pointer flex-col gap-3.5 rounded-[24px] border border-white bg-white p-5 shadow-[0px_4px_20px_rgba(0,86,133,0.05)] transition-[border-color,box-shadow] hover:border-outline-variant hover:shadow-[0px_8px_30px_rgba(0,86,133,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container",
        row.status === "archived" && "opacity-[0.72]",
      )}
    >
      <div className="flex items-center gap-3 pr-7">
        <span className="grid size-12 shrink-0 place-items-center rounded-full bg-avatar-placeholder text-[15px] font-bold text-on-avatar-placeholder">
          {initials(c.full_name, c.email)}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-base font-bold">{name}</span>
          <span className="truncate text-xs text-outline">{c.email ?? "—"}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-aura-primary/[0.08] px-2.5 py-[3px] text-[11px] font-bold text-aura-primary">
          {clientPlanLabel(c)}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-[3px] text-[11px] font-bold",
            STATUS_CHIP[row.status],
          )}
        >
          {STATUS_LABEL[row.status]}
        </span>
      </div>
      {row.credits && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-2 text-xs">
            <span className="font-semibold text-on-surface-variant">{row.credits.title}</span>
            <span className="font-bold tabular-nums">{row.credits.label}</span>
          </div>
          <CreditsBar row={row} />
        </div>
      )}
      {row.status === "expiring" && row.renewal && (
        <p className="-mt-1.5 text-xs font-semibold text-warning-text">{row.renewal.reason}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-surface-container-low pt-3 text-xs">
        <span
          className={cn(
            "flex min-w-0 items-center gap-1.5",
            row.nextSessionMs ? "text-on-surface" : "text-outline",
          )}
        >
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{fmtNextSession(row.nextSessionMs)}</span>
        </span>
        <span
          title="Presenza alle sessioni"
          className={cn("font-bold tabular-nums", attendanceColor(row.attendance))}
        >
          {row.attendance === null ? "—" : `${row.attendance}%`}
        </span>
      </div>
      <div className="absolute right-2.5 top-3">{menu}</div>
    </div>
  );
}

const TABLE_COLS = "minmax(220px,2.2fr) 1.3fr 1fr 1.4fr 1.3fr 0.7fr 44px";

function ClientsTable({
  rows,
  onOpen,
  onKey,
  menuFor,
}: {
  rows: readonly ClientRow[];
  onOpen: (id: string) => void;
  onKey: (id: string) => (e: KeyboardEvent) => void;
  menuFor: (r: ClientRow) => React.ReactNode;
}) {
  return (
    <div
      data-clients-table
      className="w-full min-w-0 overflow-x-auto rounded-[24px] bg-white [contain:inline-size] shadow-[0px_4px_20px_rgba(0,86,133,0.05)]"
    >
      <div className="min-w-[880px]" role="table" aria-label="Clienti">
        <div
          role="row"
          className="grid gap-3 bg-surface px-5 py-3 text-[11px] font-bold uppercase tracking-[0.05em] text-outline"
          style={{ gridTemplateColumns: TABLE_COLS }}
        >
          {["Cliente", "Piano", "Stato", "Crediti", "Prossima sessione", "Presenza", ""].map(
            (h, i) => (
              <span key={i} role="columnheader">
                {h}
              </span>
            ),
          )}
        </div>
        {rows.map((r) => {
          const c = r.client;
          const name = nameOf(r);
          return (
            <div
              key={c.id}
              role="link"
              tabIndex={0}
              aria-label={`Apri il profilo di ${name}`}
              data-client-card={c.id}
              onClick={() => onOpen(c.id)}
              onKeyDown={onKey(c.id)}
              className={cn(
                "relative grid cursor-pointer items-center gap-3 border-t border-surface-container-low px-5 py-3 hover:bg-[#fbfbfd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-container",
                r.status === "archived" && "opacity-[0.72]",
              )}
              style={{ gridTemplateColumns: TABLE_COLS }}
            >
              <span role="cell" className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-avatar-placeholder text-xs font-bold text-on-avatar-placeholder">
                  {initials(c.full_name, c.email)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{name}</span>
                  <span className="truncate text-xs text-outline">{c.email ?? "—"}</span>
                </span>
              </span>
              <span role="cell" className="text-[13px] text-on-surface-variant">
                {clientPlanLabel(c)}
              </span>
              <span role="cell">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-[3px] text-[11px] font-bold",
                    STATUS_CHIP[r.status],
                  )}
                >
                  {STATUS_LABEL[r.status]}
                </span>
              </span>
              <span role="cell" className="flex items-center gap-2 text-xs font-bold tabular-nums">
                {r.credits ? (
                  <>
                    <CreditsBar row={r} className="max-w-[90px] flex-1" />
                    {r.credits.short}
                  </>
                ) : (
                  <span className="font-normal text-outline">—</span>
                )}
              </span>
              <span
                role="cell"
                className={cn("text-[13px]", r.nextSessionMs ? "text-on-surface" : "text-outline")}
              >
                {fmtNextSession(r.nextSessionMs)}
              </span>
              <span
                role="cell"
                className={cn("text-[13px] font-bold tabular-nums", attendanceColor(r.attendance))}
              >
                {r.attendance === null ? "—" : `${r.attendance}%`}
              </span>
              <span role="cell" className="relative">
                {menuFor(r)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
