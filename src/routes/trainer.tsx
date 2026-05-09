import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { TrainerSidebar } from "@/components/trainer-sidebar";
import { useAuth, TRAINER_EMAIL } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/trainer")({
  component: TrainerLayout,
});

function TrainerLayout() {
  const { session, role, user, loading } = useAuth();
  const isTrainer = role === "trainer" && user?.email?.toLowerCase() === TRAINER_EMAIL;

  useEffect(() => {
    if (!loading && session && !isTrainer) {
      toast.error("Accesso negato", { description: "Quest'area è riservata al trainer." });
    }
  }, [loading, session, isTrainer]);

  if (loading) return <div className="min-h-screen grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (!session) return <Navigate to="/auth" />;
  if (!isTrainer) return <Navigate to="/client" />;

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
