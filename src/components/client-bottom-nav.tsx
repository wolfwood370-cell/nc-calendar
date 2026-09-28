// ----------------------------------------------------------------------------
// ClientBottomNav — la barra in basso del cliente (lato cliente, passata 01,
// audit N2, O2, T2 e V14)
// ----------------------------------------------------------------------------
// Cinque schede con l'etichetta visibile (prima solo le icone), nell'ordine di
// CLIENT_TABS; la scheda accesa la dice activeClientTab, per segmenti di
// percorso (sul dettaglio di una sessione si accende Sessioni, non più
// «Calendario»). Solo sotto md e solo sulle cinque schede: le pagine aperte
// (dettaglio, Notifiche) non hanno la barra. Su Sessioni il badge delle
// sessioni «Da confermare», dalla cornice (useClientShell), che lo aggiorna
// col passo di useNow. Sta nel layout, fuori dal div.page-enter: il suo
// transform farebbe scorrere un elemento fixed col contenuto.
// ----------------------------------------------------------------------------

import { Link, useRouterState } from "@tanstack/react-router";
import { useClientShell } from "@/hooks/use-client-shell";
import { CLIENT_TABS, activeClientTab, showsTabBar } from "@/lib/client-shell";
import { cn } from "@/lib/utils";

export function ClientBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { sessionsBadge } = useClientShell();
  if (!showsTabBar(path)) return null;
  const active = activeClientTab(path);

  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-40 flex items-start justify-around gap-0.5 border-t border-outline-variant/45 bg-white/94 px-1.5 pt-1.5 backdrop-blur-[20px] md:hidden"
      style={{ paddingBottom: "max(6px, env(safe-area-inset-bottom))" }}
    >
      {CLIENT_TABS.map((tab) => {
        const on = tab.key === active;
        const Icon = tab.icon;
        const sessions = tab.key === "sessioni";
        return (
          <Link
            key={tab.key}
            to={tab.to}
            aria-current={on ? "page" : undefined}
            aria-label={sessions ? sessionsBadge.label : undefined}
            className={cn(
              "flex h-[58px] min-w-11 flex-1 flex-col items-center justify-center gap-[3px]",
              on ? "text-aura-primary" : "text-on-surface-variant",
            )}
          >
            <span
              className={cn(
                "relative grid h-8 w-14 place-items-center rounded-full",
                on && "bg-primary-container/12",
              )}
            >
              <Icon className="size-[22px]" aria-hidden />
              {sessions && sessionsBadge.count > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-warning-text px-[5px] text-xs leading-none font-bold text-white"
                >
                  {sessionsBadge.count}
                </span>
              )}
            </span>
            <span className={cn("text-xs whitespace-nowrap", on ? "font-bold" : "font-semibold")}>
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
