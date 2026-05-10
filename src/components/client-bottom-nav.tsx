import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, User } from "lucide-react";

const tabs = [
  { to: "/client", icon: Home, label: "Home", exact: true },
  { to: "/client/book", icon: CalendarDays, label: "Calendario", exact: false },
  { to: "/client/settings", icon: User, label: "Profilo", exact: false },
] as const;

export function ClientBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 w-full max-w-md mx-auto z-40 rounded-t-[2rem] bg-white/70 backdrop-blur-xl border-t border-white/20 shadow-[0_-8px_30px_rgba(0,0,0,0.04)] left-1/2 -translate-x-1/2 md:hidden flex justify-around items-center px-6 py-4 pb-8">
      {tabs.map((t) => {
        const active = t.exact ? path === t.to : path.startsWith(t.to);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            aria-label={t.label}
            className={`flex flex-col items-center justify-center rounded-full p-3 transition-all active:scale-90 duration-200 ${
              active
                ? "bg-primary-container text-on-primary-container"
                : "text-on-surface-variant hover:bg-surface-container-highest"
            }`}
          >
            <Icon className="size-6" />
            <span className="sr-only">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
