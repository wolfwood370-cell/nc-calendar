import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { LayoutDashboard, CalendarDays, Users, LayersIcon, Dumbbell, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

const items = [
  { title: "Overview", url: "/trainer", icon: LayoutDashboard, exact: true },
  { title: "Calendar", url: "/trainer/calendar", icon: CalendarDays },
  { title: "Clients", url: "/trainer/clients", icon: Users },
  { title: "Block builder", url: "/trainer/blocks", icon: LayersIcon },
];

export function TrainerSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const displayName = (user?.user_metadata?.full_name as string) || user?.email || "";
  const navigate = useNavigate();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="size-8 rounded-md bg-primary text-primary-foreground grid place-items-center">
            <Dumbbell className="size-4" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="font-display text-sm font-semibold leading-none">Stride</p>
            <p className="text-xs text-muted-foreground mt-1">Studio</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = item.exact ? path === item.url : path.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url}>
                        <item.icon className="size-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 pb-2 group-data-[collapsible=icon]:hidden">
          <div className="rounded-lg border bg-card p-3">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 w-full justify-start"
              onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}
            >
              <LogOut className="size-4" /> Esci
            </Button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
