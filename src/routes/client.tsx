import { createFileRoute, Link, Outlet, useNavigate, useRouterState, Navigate } from "@tanstack/react-router";
import { Dumbbell, Home, CalendarPlus, LogOut, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { InstallPwaButton } from "@/components/install-pwa-button";
import { PwaInstallToast } from "@/components/pwa-install-toast";

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

  const tabs = [
    { to: "/client", label: "Blocco", icon: Home, exact: true },
    { to: "/client/book", label: "Prenota", icon: CalendarPlus },
    { to: "/client/settings", label: "Impostazioni", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b sticky top-0 bg-background/80 backdrop-blur z-10">
        <div className="mx-auto max-w-3xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
              <Dumbbell className="size-4" />
            </div>
            <span className="font-display font-semibold">Stride</span>
          </div>
          <div className="flex items-center gap-2">
            <InstallPwaButton />
            <Button variant="ghost" size="sm" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
              <LogOut className="size-4" /> Esci
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-6 pb-24">
        <Outlet />
      </main>

      {/* Mobile-first bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 border-t bg-background/95 backdrop-blur md:static md:border-0 md:bg-transparent md:hidden">
        <div className="mx-auto max-w-3xl grid grid-cols-3">
          {tabs.map((t) => {
            const active = t.exact ? path === t.to : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={`flex flex-col items-center gap-1 py-3 text-xs ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <t.icon className="size-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
