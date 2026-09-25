// ----------------------------------------------------------------------------
// TrainerHeader — header desktop del coach (56px, sticky)
// ----------------------------------------------------------------------------
// A sinistra il percorso della pagina (audit S1), a destra le azioni globali:
// ricerca clienti (S2), menu «Nuovo» (S2) e notifiche (S4). Solo desktop: le
// pagine mobile hanno la loro testata.
// ----------------------------------------------------------------------------

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { CalendarPlus, ChevronDown, ChevronRight, Plus, UserPlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCoachClients } from "@/lib/queries";
import type { FileRoutesById } from "@/routeTree.gen";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TrainerClientSearch } from "@/components/trainer-client-search";
import { TrainerNotificationsBell } from "@/components/trainer-notifications-bell";

interface Crumb {
  /** Vuoto mentre il nome del cliente carica (al suo posto uno scheletro). */
  title: string;
  /** Genitore: link solo se ha una pagina («Clienti»), testo semplice altrimenti («Impostazioni»). */
  parent?: { label: string; to?: "/trainer/clients" };
}

const SETTINGS = { label: "Impostazioni" };
const CLIENTS = { label: "Clienti", to: "/trainer/clients" } as const;

const CRUMBS = {
  "/trainer/": { title: "Panoramica" },
  "/trainer/calendar": { title: "Calendario" },
  "/trainer/clients/": { title: "Clienti" },
  "/trainer/event-types": { title: "Tipologie di sessione", parent: SETTINGS },
  "/trainer/availability": { title: "Disponibilità", parent: SETTINGS },
  "/trainer/integrations": { title: "Integrazioni", parent: SETTINGS },
} satisfies Partial<Record<keyof FileRoutesById, Crumb>>;

const CLIENT_PROFILE = "/trainer/clients/$id" satisfies keyof FileRoutesById;

function useCrumb(): Crumb | null {
  const { user } = useAuth();
  const routeId = useRouterState({ select: (s) => s.matches[s.matches.length - 1]?.routeId });
  const clientId = useRouterState({
    select: (s) => {
      const leaf = s.matches[s.matches.length - 1];
      return leaf?.routeId === CLIENT_PROFILE ? (leaf.params as { id?: string }).id : undefined;
    },
  });
  // «Clienti › Nome»: il nome arriva dalla stessa cache della ricerca clienti.
  const clientsQ = useCoachClients(user?.id);

  if (clientId) {
    const client = clientsQ.data?.find((c) => c.id === clientId);
    const name = client?.full_name || client?.email || "";
    return { title: name || (clientsQ.isLoading ? "" : "Profilo cliente"), parent: CLIENTS };
  }
  return routeId && routeId in CRUMBS ? CRUMBS[routeId as keyof typeof CRUMBS] : null;
}

function Breadcrumb() {
  const crumb = useCrumb();
  if (!crumb) return null;
  return (
    // Il percorso non si restringe: si accorcia con l'ellissi solo oltre lo
    // spazio lasciato alle azioni (360px), cioè con titoli molto lunghi.
    <nav aria-label="Percorso" className="flex max-w-[calc(100%-360px)] min-w-0 flex-none text-sm">
      <ol className="flex min-w-0 items-center gap-2">
        {crumb.parent && (
          <li className="flex shrink-0 items-center gap-2">
            {crumb.parent.to ? (
              <Link
                to={crumb.parent.to}
                // exact: sulla pagina figlia il genitore non è la pagina corrente
                // (niente aria-current="page" doppio nel percorso).
                activeOptions={{ exact: true }}
                className="font-medium whitespace-nowrap text-outline transition-colors hover:text-aura-primary"
              >
                {crumb.parent.label}
              </Link>
            ) : (
              <span className="font-medium whitespace-nowrap text-outline">
                {crumb.parent.label}
              </span>
            )}
            <ChevronRight aria-hidden className="size-3.5 text-outline-variant" />
          </li>
        )}
        <li className="flex min-w-0">
          {crumb.title ? (
            <span
              aria-current="page"
              className="truncate font-semibold whitespace-nowrap text-on-surface"
            >
              {crumb.title}
            </span>
          ) : (
            <Skeleton className="h-4 w-32 rounded-full" />
          )}
        </li>
      </ol>
    </nav>
  );
}

function NewMenu() {
  const navigate = useNavigate();
  const itemClass =
    "cursor-pointer gap-2.5 rounded-[12px] px-3 py-2.5 text-sm font-medium text-on-surface focus:bg-surface-container-low focus:text-on-surface [&>svg]:text-aura-primary";
  return (
    // modal={false}: niente blocco dello scroll né focus intrappolato, così
    // ⌘K e gli altri controlli dell'header restano raggiungibili.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-[38px] shrink-0 items-center gap-1.5 rounded-full bg-aura-primary pr-3.5 pl-4 text-sm font-semibold text-white transition-colors hover:bg-primary-container data-[state=open]:bg-primary-container"
        >
          <Plus aria-hidden className="size-4" />
          Nuovo
          <ChevronDown aria-hidden className="size-3.5 opacity-80" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[220px] rounded-[18px] border-surface-container bg-white p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.16)]"
      >
        {/* I dialog di creazione si aprono con le passate 04 (sessione) e 05 (cliente). */}
        <DropdownMenuItem
          className={itemClass}
          onSelect={() => void navigate({ to: "/trainer/calendar", search: { new: "sessione" } })}
        >
          <CalendarPlus aria-hidden />
          Nuova sessione
        </DropdownMenuItem>
        <DropdownMenuItem
          className={itemClass}
          onSelect={() => void navigate({ to: "/trainer/clients", search: { new: "cliente" } })}
        >
          <UserPlus aria-hidden />
          Nuovo cliente
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TrainerHeader() {
  return (
    <header className="sticky top-0 z-40 hidden h-14 items-center gap-3 border-b border-white/50 bg-white/40 px-6 text-on-surface backdrop-blur-2xl md:flex">
      <Breadcrumb />
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2.5">
        <TrainerClientSearch />
        <NewMenu />
        <TrainerNotificationsBell />
      </div>
    </header>
  );
}
