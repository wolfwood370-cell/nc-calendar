import { Link, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  LogOut,
  Plug,
  Clock,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCoachBookings } from "@/lib/queries";
import { countToAssign, formatToAssign } from "@/lib/to-assign";
import { initials } from "@/lib/initials";
import logoUrl from "@/assets/ncc-logo.png";

type TrainerPath =
  | "/trainer"
  | "/trainer/calendar"
  | "/trainer/clients"
  | "/trainer/event-types"
  | "/trainer/availability"
  | "/trainer/integrations";

interface NavItem {
  title: string;
  url: TrainerPath;
  icon: LucideIcon;
  exact?: boolean;
}

// Audit S3: il lavoro di tutti i giorni separato dalla configurazione, come
// già nelle «Impostazioni rapide» mobile.
const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "Area di lavoro",
    items: [
      { title: "Panoramica", url: "/trainer", icon: LayoutDashboard, exact: true },
      { title: "Calendario", url: "/trainer/calendar", icon: CalendarDays },
      { title: "Clienti", url: "/trainer/clients", icon: Users },
    ],
  },
  {
    label: "Impostazioni",
    items: [
      { title: "Tipologie di sessione", url: "/trainer/event-types", icon: Tag },
      { title: "Disponibilità", url: "/trainer/availability", icon: Clock },
      { title: "Integrazioni", url: "/trainer/integrations", icon: Plug },
    ],
  },
];

/** Sidebar desktop del coach (256px): Link imposta aria-current="page" sulla voce attiva. */
export function TrainerSidebar() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const displayName = (user?.user_metadata?.full_name as string) || user?.email || "";

  // Audit V12: stessa query e stesso criterio del filtro «Da assegnare» del Calendario.
  const bookingsQ = useCoachBookings(user?.id);
  const toAssign = countToAssign(bookingsQ.data);

  return (
    <div className="sticky top-0 flex h-svh w-64 flex-col border-r bg-white/40 text-on-surface backdrop-blur-2xl">
      <div className="flex items-center gap-2.5 p-4">
        <div className="size-8 shrink-0 overflow-hidden rounded-[8px] bg-white">
          <img
            src={logoUrl}
            alt="NC Calendar"
            className="h-full w-full scale-[1.2] object-cover object-center"
          />
        </div>
        <div>
          <p className="font-display text-sm leading-none font-semibold">NC Calendar</p>
          <p className="mt-1 text-xs leading-4 text-outline">Studio</p>
        </div>
      </div>

      <nav
        aria-label="Menu principale"
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 py-1"
      >
        {groups.map((group) => {
          const labelId = `sidebar-${group.label.replace(/\s+/g, "-").toLowerCase()}`;
          return (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p
                id={labelId}
                className="flex h-8 items-center px-3 text-[11px] font-semibold tracking-[0.05em] text-outline uppercase"
              >
                {group.label}
              </p>
              <ul aria-labelledby={labelId} className="flex flex-col gap-1">
                {group.items.map((item) => {
                  const badge = item.url === "/trainer/calendar" ? toAssign : 0;
                  return (
                    <li key={item.url}>
                      <Link
                        to={item.url}
                        activeOptions={{ exact: item.exact ?? false, includeSearch: false }}
                        className="flex h-9 items-center gap-3 rounded-full px-3 text-sm transition-colors"
                        activeProps={{
                          className: "bg-aura-primary/10 font-semibold text-aura-primary",
                        }}
                        inactiveProps={{
                          className: "font-medium text-on-surface-variant hover:bg-aura-primary/6",
                        }}
                      >
                        <item.icon className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        {badge > 0 && (
                          <span
                            aria-label={formatToAssign(badge)}
                            title={formatToAssign(badge)}
                            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-tertiary-container/12 px-1.5 text-[11px] font-bold text-tertiary-container tabular-nums"
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="p-4">
        <div className="flex flex-col gap-2 rounded-[16px] border border-outline-variant bg-white p-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-full bg-aura-primary text-xs font-bold text-white"
            >
              {initials(displayName, user?.email)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm leading-5 font-semibold">{displayName}</p>
              <p className="truncate text-xs leading-4 text-outline">{user?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth" });
            }}
            className="flex h-8 w-full items-center gap-2 rounded-full px-2.5 text-xs font-semibold text-on-surface-variant transition-colors hover:bg-surface-container"
          >
            <LogOut className="size-4" aria-hidden /> Esci
          </button>
        </div>
      </div>
    </div>
  );
}
