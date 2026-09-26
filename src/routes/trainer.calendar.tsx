import { createFileRoute } from "@tanstack/react-router";
import { CalendarDesktop } from "@/components/calendar-desktop";
import { CalendarMobile } from "@/components/calendar-mobile";
import { useGcalSync } from "@/hooks/use-gcal-sync";
import { useAuth } from "@/lib/auth";
import { parseCalendarSearch } from "@/lib/calendar-search";

// Stato del Calendario nell'URL (passata 04, audit T4): date, view, filter,
// types, avail, event; new=sessione e client=<id> aprono la creazione. Le
// notifiche portano `date` ed `event`, il menu «Nuovo» porta `new=sessione`.
export const Route = createFileRoute("/trainer/calendar")({
  validateSearch: parseCalendarSearch,
  head: () => ({
    meta: [
      { title: "Calendario · NC Calendar" },
      {
        name: "description",
        content:
          "Tutti gli appuntamenti, i blocchi personali e la sincronizzazione con Google Calendar.",
      },
      { property: "og:title", content: "Calendario · NC Calendar" },
      {
        property: "og:description",
        content:
          "Tutti gli appuntamenti, i blocchi personali e la sincronizzazione con Google Calendar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CalendarPage,
});

// Sul telefono il Calendario resta com'era (calendar-mobile.tsx); da md in su
// è quello della passata 04 (calendar-desktop.tsx). La sincronizzazione con
// Google all'apertura è una sola per entrambi.
function CalendarPage() {
  const { user } = useAuth();
  const sync = useGcalSync(user?.id);
  return (
    <>
      <div className="md:hidden">
        <CalendarMobile sync={sync} />
      </div>
      <div className="hidden md:block">
        <CalendarDesktop sync={sync} />
      </div>
    </>
  );
}
