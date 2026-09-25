import {
  createFileRoute,
  Outlet,
  Navigate,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { TrainerSidebar } from "@/components/trainer-sidebar";
import { TrainerHeader } from "@/components/trainer-header";
import { TrainerBottomNav } from "@/components/trainer-bottom-nav";
import { ReviewBookingDialog } from "@/components/review-booking-dialog";
import { useAuth, pathForRole } from "@/lib/auth";
import { uuidParam } from "@/lib/search-params";
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
    // M4 (audit Wave 3): only accept a valid UUID — anything else is
    // dropped silently to avoid a Postgres 22P02 bubbling into the UI.
    reviewEventId: uuidParam(search.reviewEventId),
  }),
});

function TrainerLayout() {
  const { session, role, loading } = useAuth();
  const allowed = role === "coach" || role === "admin";
  const navigate = useNavigate();
  const { reviewEventId } = Route.useSearch();
  const path = useRouterState({ select: (s) => s.location.pathname });

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
    // Design handoff: su desktop la pagina ha il gradiente del mock
    // (135deg #f2f3f8→#e7e8ec) che traspare sotto sidebar/header glass.
    <div className="min-h-screen flex w-full bg-background md:bg-[linear-gradient(135deg,#f2f3f8,#e7e8ec)]">
      {/* Sidebar: desktop only, sticky a tutta altezza. On mobile the
          TrainerBottomNav at the bottom of the viewport replaces it. */}
      <div className="hidden md:block">
        <TrainerSidebar />
      </div>
      {/* Colonna contenuto: su desktop niente fondo, così il gradiente
          traspare sotto l'header come nel mock (su mobile resta bg-background). */}
      <div className="relative flex w-full flex-1 flex-col bg-background md:bg-transparent">
        {/* Desktop header (percorso, ricerca, «Nuovo», notifiche). The
            mobile views render their own glassmorphic header inside each page. */}
        <TrainerHeader />
        {/* pb on mobile clears the bottom nav (64px nav + safe-area).
            Desktop: mock = main #f8f9fe dentro il gradiente di pagina; il
            padding resta 24px perché molte route lo compensano con -m-6
            per i propri sfondi full-bleed. */}
        <main className="p-0 md:p-6 pb-[88px] md:pb-6 md:bg-surface">
          {/* key sul pathname: rimonta la vista a ogni navigazione così
              l'animazione page-enter (design handoff) riparte. */}
          <div key={path} className="page-enter">
            <Outlet />
          </div>
        </main>
        {/* Global review modal — reachable from any /trainer/* page via
            navigate({ search: { reviewEventId: bookingId } }). One
            component, one mount point, consistent UX. */}
        <ReviewBookingDialog bookingId={reviewEventId ?? null} onClose={closeReviewDialog} />
      </div>
      {/* Mobile bottom navigation. Hidden on md+ by the component itself. */}
      <TrainerBottomNav />
    </div>
  );
}
