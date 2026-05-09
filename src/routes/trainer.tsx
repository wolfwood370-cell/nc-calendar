import { createFileRoute, Outlet, Navigate } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { TrainerSidebar } from "@/components/trainer-sidebar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/trainer")({
  component: TrainerLayout,
});

function TrainerLayout() {
  const { session } = useAuth();
  if (!session) return <Navigate to="/auth" />;
  if (session.role !== "trainer") return <Navigate to="/client" />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <TrainerSidebar />
        <SidebarInset>
          <header className="h-14 flex items-center gap-3 border-b px-4 sticky top-0 bg-background/80 backdrop-blur z-10">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border" />
            <p className="text-sm text-muted-foreground">Trainer Studio</p>
          </header>
          <main className="p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
