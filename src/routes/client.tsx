import {
  createFileRoute,
  Outlet,
  useNavigate,
  Navigate,
  Link,
  useRouterState,
} from "@tanstack/react-router";
import { LogOut } from "lucide-react";

// B18 (audit): su desktop il cliente non aveva navigazione tra le sezioni
// (ClientBottomNav è md:hidden). Stessi link della bottom nav, mostrati
// nell'header desktop.
const DESKTOP_TABS = [
  { to: "/client", label: "Home", exact: true },
  { to: "/client/book", label: "Calendario", exact: false },
  { to: "/client/store", label: "Booster", exact: false },
  { to: "/client/settings", label: "Profilo", exact: false },
] as const;
import { useAuth } from "@/lib/auth";
import nccLogo from "@/assets/ncc-logo.png";
import { Button } from "@/components/ui/button";
import { InstallPwaButton } from "@/components/install-pwa-button";
import { PwaOnboarding } from "@/components/pwa-onboarding";
import { ClientBottomNav } from "@/components/client-bottom-nav";

export const Route = createFileRoute("/client")({
  component: ClientLayout,
});

function ClientLayout() {
  const { session, role, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (role === "admin") return <Navigate to="/admin" />;
  if (role === "coach") return <Navigate to="/trainer" />;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PwaOnboarding />
      {/* Desktop / tablet header (hidden on mobile, the dashboard provides its own top bar) */}
      <header className="hidden md:block border-b sticky top-0 bg-surface/80 backdrop-blur z-10">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
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
          <nav className="flex items-center gap-1">
            {DESKTOP_TABS.map((t) => {
              const active = t.exact ? path === t.to : path.startsWith(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    active
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
            <InstallPwaButton />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" /> Esci
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl md:px-4 md:py-6 pb-24">
        <Outlet />
      </main>

      <ClientBottomNav />
    </div>
  );
}
