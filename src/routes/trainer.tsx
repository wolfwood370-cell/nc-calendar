import { createFileRoute, Outlet, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { TrainerSidebar } from "@/components/trainer-sidebar";
import { TrainerBottomNav } from "@/components/trainer-bottom-nav";
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
      <div className="min-h-screen flex w-full bg-background">
        {/* Sidebar: desktop only. On mobile the TrainerBottomNav at the
            bottom of the viewport replaces it (mobile layer integration). */}
        <div className="hidden md:flex">
          <TrainerSidebar />
        </div>
        <SidebarInset>
          {/* Desktop top bar — kept md+ only to preserve the existing
              SidebarTrigger UX on desktop. The mobile views render their
              own glassmorphic header inside each page. */}
          <header className="hidden md:flex h-14 items-center gap-3 border-b border-white/20 px-4 sticky top-0 bg-white/40 backdrop-blur-2xl z-10">
            <SidebarTrigger />
            <div className="h-5 w-px bg-border/40" />
            <p className="text-sm text-muted-foreground">Studio Trainer</p>
          </header>
          {/* pb on mobile clears the bottom nav (64px nav + safe-area). */}
          <main className="p-0 md:p-6 pb-[88px] md:pb-6">
            <Outlet />
          </main>
          {/* Global review modal — reachable from any /trainer/* page via
              navigate({ search: { reviewEventId: bookingId } }). One
              component, one mount point, consistent UX. */}
          <ReviewBookingDialog bookingId={reviewEventId ?? null} onClose={closeReviewDialog} />
        </SidebarInset>
        {/* Mobile bottom navigation. Hidden on md+ by the component itself. */}
        <TrainerBottomNav />
      </div>
    </SidebarProvider>
  );
}
