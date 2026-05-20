// ----------------------------------------------------------------------------
// TrainerBottomNav — mobile-only sticky navigation for the trainer subtree.
// ----------------------------------------------------------------------------
// Replaces the sidebar on screens below the md breakpoint. Three even-width
// links to Home / Calendar / Clients. Active link gets a pill-shaped
// secondary-container highlight around the icon (matches the Stitch mockup
// for the trainer dashboard).
//
// Mounted once inside the /trainer layout (src/routes/trainer.tsx), so the
// nav follows the user across every trainer route without needing per-page
// integration.
// ----------------------------------------------------------------------------

import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, Users } from "lucide-react";

type Tab = {
  to: "/trainer" | "/trainer/calendar" | "/trainer/clients";
  icon: typeof Home;
  label: string;
  // Exact-match: required for / to avoid both Home and Calendar lighting
  // up at the same time (/trainer/calendar startsWith /trainer).
  exact?: boolean;
};

const TABS: Tab[] = [
  { to: "/trainer", icon: Home, label: "Home", exact: true },
  { to: "/trainer/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/trainer/clients", icon: Users, label: "Clients" },
];

export function TrainerBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      // Flat white surface with a thin top border — no drop shadow per the
      // spec. Safe-area inset keeps the nav above iOS home indicator.
      className="fixed bottom-0 inset-x-0 z-50 block md:hidden bg-surface-container-lowest border-t border-outline-variant/20"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Navigazione principale"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {TABS.map((t) => {
          const active = t.exact ? path === t.to : path.startsWith(t.to);
          const Icon = t.icon;
          return (
            <Link
              key={t.to}
              to={t.to}
              aria-current={active ? "page" : undefined}
              aria-label={t.label}
              // 44px tap minimum (M4 audit fix lives in client-bottom-nav;
              // mirror it here so coaches on small phones / watches don't
              // miss the tap target).
              className="flex flex-col items-center justify-center gap-1 min-w-11 min-h-11 active:scale-90 transition-transform duration-150"
            >
              <span
                className={
                  active
                    ? "flex items-center justify-center rounded-full bg-secondary-container text-on-secondary-container px-6 py-1"
                    : "flex items-center justify-center text-on-surface-variant px-6 py-1"
                }
              >
                <Icon className="size-5" />
              </span>
              <span
                className={
                  active
                    ? "text-[11px] font-semibold text-on-surface"
                    : "text-[11px] font-medium text-on-surface-variant"
                }
              >
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
