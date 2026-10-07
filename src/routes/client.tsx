import type { ReactNode } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  Navigate,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import nccLogo from "@/assets/ncc-logo.png";
import { Button } from "@/components/ui/button";
import { ClientBottomNav } from "@/components/client-bottom-nav";
import { ClientNotificationsBell } from "@/components/client-notifications-bell";
import { ClientShellContext, useClientShellState } from "@/hooks/use-client-shell";
import { CLIENT_TABS, activeClientTab, showsTabBar } from "@/lib/client-shell";
import { forgetPushForUser } from "@/lib/push";

export const Route = createFileRoute("/client")({
  // viewport-fit a «cover» sta nella radice per tutta l'app (passata 12,
  // __root.tsx): senza, su iPhone env(safe-area-inset-*) vale 0. Con «cover»
  // la pagina va anche sotto la tacca in orizzontale: il layout e la barra
  // tengono i margini di sinistra e destra.
  component: ClientLayout,
});

/** I dati della cornice, letti una volta per tutto il layout (use-client-shell.ts). */
function ClientShell({ children }: { children: ReactNode }) {
  const shell = useClientShellState();
  return <ClientShellContext.Provider value={shell}>{children}</ClientShellContext.Provider>;
}

function ClientLayout() {
  const { session, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (role === "admin") return <Navigate to="/admin" />;
  if (role === "coach") return <Navigate to="/trainer" />;

  const active = activeClientTab(path);
  // Sotto md, nelle cinque schede, sotto il contenuto c'è lo spazio della
  // barra (1 px di bordo, 6 di padding, 58 di scheda e la safe area) più 24;
  // nelle pagine aperte e da md in su 24 più la safe area.
  const bottomSpace = showsTabBar(path)
    ? "pb-[calc(65px_+_max(6px,env(safe-area-inset-bottom))_+_24px)] md:pb-[calc(24px_+_env(safe-area-inset-bottom))]"
    : "pb-[calc(24px_+_env(safe-area-inset-bottom))]";

  return (
    <ClientShell>
      <div
        className="min-h-screen bg-surface flex flex-col"
        style={{
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        {/* Header desktop (da md): le stesse cinque schede della barra, la campanella ed Esci */}
        <header className="hidden md:block border-b sticky top-0 bg-surface/80 backdrop-blur z-40">
          <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-md overflow-hidden bg-white flex-shrink-0">
                <img
                  src={nccLogo}
                  alt="NC Calendar"
                  className="w-full h-full object-cover object-center scale-[1.2]"
                />
              </div>
              <span className="font-display font-semibold">NC Calendar</span>
            </div>
            <nav aria-label="Navigazione principale" className="flex items-center gap-1">
              {CLIENT_TABS.map((t) => {
                const on = t.key === active;
                return (
                  <Link
                    key={t.key}
                    to={t.to}
                    // Come nella barra: aria-current lo decide activeClientTab,
                    // non il Link di TanStack (che senza exact accende /client ovunque).
                    activeOptions={{ exact: true, includeSearch: false }}
                    aria-current={on ? "page" : undefined}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      on
                        ? "bg-primary-container text-on-primary-container"
                        : "text-on-surface-variant hover:bg-surface-container-highest"
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-2">
              <ClientNotificationsBell />
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  // Le notifiche di chi esce non arrivano più a questo dispositivo (passata 08).
                  await forgetPushForUser(session.user.id);
                  if (await signOut()) navigate({ to: "/auth" });
                }}
              >
                <LogOut className="size-4" /> Esci
              </Button>
            </div>
          </div>
        </header>

        {/* Da md in su le pagine stanno in una colonna larga al massimo 560. */}
        <main className={`flex-1 mx-auto w-full md:max-w-[560px] md:px-4 md:pt-6 ${bottomSpace}`}>
          {/* key sul pathname: rimonta la vista a ogni navigazione così
              l'animazione page-enter (design handoff) riparte. Niente
              position: fixed nelle pagine: il transform che l'animazione
              lascia sul div diventa il riferimento dei fixed, che scorrono
              col contenuto (succede alla barra «Conferma» di Prenota, che la
              passata 02 toglie). Barra, fogli e toast stanno fuori da qui. */}
          <div key={path} className="page-enter">
            <Outlet />
          </div>
        </main>

        <ClientBottomNav />
      </div>
    </ClientShell>
  );
}
