import { createFileRoute, Outlet, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { TrainerSidebar } from "@/components/trainer-sidebar";
import { ReviewBookingDialog } from "@/components/review-booking-dialog";
import { useAuth, pathForRole } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// Global search schema for the trainer subtree. Any child route can
// trigger the ReviewBookingDialog by navigating with `?reviewEventId=`
// (the dialog reads this directly from the route search).
interface TrainerSearch {
  reviewEventId?: string;
}

export const Route = createFileRoute("/trainer")({
  component: TrainerLayout,
  validateSearch: (search: Record<string, unknown>): TrainerSearch => ({
    reviewEventId:
      typeof search.reviewEventId === "string" && search.reviewEventId.length > 0
        ? search.reviewEventId
        : undefined,
  }),
});

function TrainerLayout() {
  const { session, role, loading } = useAuth();
  const allowed = role === "coach" || role === "admin";
  const navigate = useNavigate();
  const { reviewEventId } = Route.useSearch();

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

  // P4: close handler strips the search param via search-only navigation
  // so the dialog can be reopened from anywhere by adding it back.
  const closeReviewDialog = () => {
    navigate({
      to: ".",
      search: (prev: TrainerSearch) => ({ ...prev, reviewEventId: undefined }),
    });
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <TrainerSidebar />
        <SidebarInset>
          <header className="h-14 flex items-center gap-3 border-b border-white/20 px-4 sticky top-0 bg-white/40 backdrop-blur-2xl z-10">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border/40" />
            <p className="text-sm text-muted-foreground">Studio Trainer</p>
          </header>
          <main className="p-6">
            <Outlet />
          </main>
          {/* Global review modal — reachable from any /trainer/* page via
              navigate({ search: { reviewEventId: bookingId } }). One
              component, one mount point, consistent UX. */}
          <ReviewBookingDialog
            bookingId={reviewEventId ?? null}
            onClose={closeReviewDialog}
          />
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
