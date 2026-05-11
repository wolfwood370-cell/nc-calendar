import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { TrainerSidebar } from "@/components/trainer-sidebar";
import { useAuth, pathForRole } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer")({
  component: TrainerLayout,
});

function TrainerLayout() {
  const { session, role, loading } = useAuth();
  const allowed = role === "coach" || role === "admin";

  useEffect(() => {
    if (!loading && session && !allowed) {
      toast.error("Accesso negato", { description: "Quest'area è riservata ai coach." });
    }
  }, [loading, session, allowed]);

  if (loading)
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (!session) return <Navigate to="/auth" />;
  if (!allowed) return <Navigate to={pathForRole(role)} />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <TrainerSidebar />
        <SidebarInset>
          <header className="h-14 flex items-center gap-3 border-b px-4 sticky top-0 bg-background/80 backdrop-blur z-10">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border" />
            <p className="text-sm text-muted-foreground">Studio Trainer</p>
          </header>
          <main className="p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
