import { createFileRoute, Outlet, useNavigate, Navigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import nccLogo from "@/assets/ncc-logo.png";
import { Button } from "@/components/ui/button";
import { InstallPwaButton } from "@/components/install-pwa-button";
import { PwaInstallToast } from "@/components/pwa-install-toast";
import { ClientBottomNav } from "@/components/client-bottom-nav";

export const Route = createFileRoute("/client")({
  component: ClientLayout,
});

function ClientLayout() {
  const { session, role, loading, signOut } = useAuth();
  const navigate = useNavigate();

  if (loading) return null;
  if (!session) return <Navigate to="/auth" />;
  if (role === "admin") return <Navigate to="/admin" />;
  if (role === "coach") return <Navigate to="/trainer" />;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PwaInstallToast />
      {/* Desktop / tablet header (hidden on mobile, the dashboard provides its own top bar) */}
      <header className="hidden md:block border-b sticky top-0 bg-surface/80 backdrop-blur z-10">
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

      <main className="flex-1 mx-auto w-full max-w-3xl md:px-4 md:py-6 pb-24">
        <Outlet />
      </main>

      <ClientBottomNav />
    </div>
  );
}

