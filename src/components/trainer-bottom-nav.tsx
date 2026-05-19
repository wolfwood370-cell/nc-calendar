import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, Users } from "lucide-react";

const tabs = [
  { to: "/trainer", icon: Home, label: "Home", exact: true },
  { to: "/trainer/calendar", icon: CalendarDays, label: "Calendario", exact: false },
  { to: "/trainer/clients", icon: Users, label: "Clienti", exact: false },
] as const;

export function TrainerBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Navigazione principale"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#c1c7d0]"
    >
      <ul className="flex justify-around items-center px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.map((t) => {
          const active = t.exact ? path === t.to : path.startsWith(t.to);
          const Icon = t.icon;
          return (
            <li key={t.to} className="flex-1">
              <Link
                to={t.to}
                aria-label={t.label}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1 min-h-12 px-3 py-1.5 rounded-full transition-colors"
                style={{ color: active ? "#005685" : "#717880" }}
              >
                <span
                  className="inline-flex items-center justify-center h-8 px-5 rounded-full transition-colors"
                  style={{ backgroundColor: active ? "#b2d8ff" : "transparent" }}
                >
                  <Icon className="size-5" />
                </span>
                <span className="text-[11px] font-semibold leading-none">{t.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
