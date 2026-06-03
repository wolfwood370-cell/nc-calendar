import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import { BugReportFAB } from "@/components/bug-report-fab";
import { initSentry, setSentryRouteTag } from "@/lib/sentry";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Pagina non trovata.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Torna alla home
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Si è verificato un errore</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Riprova
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#3b82f6" },
      { title: "NC Calendar" },
      {
        name: "description",
        content: "Gestione prenotazioni e blocchi di allenamento per personal trainer e clienti.",
      },
      { property: "og:title", content: "NC Calendar" },
      { name: "twitter:title", content: "NC Calendar" },
      {
        property: "og:description",
        content: "Gestione prenotazioni e blocchi di allenamento per personal trainer e clienti.",
      },
      {
        name: "twitter:description",
        content: "Gestione prenotazioni e blocchi di allenamento per personal trainer e clienti.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dbf7e04e-54a2-4f2b-a435-61c9449ef614/id-preview-536512a2--81e402d5-14ed-48a5-938a-c89e014f695a.lovable.app-1778422430349.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/dbf7e04e-54a2-4f2b-a435-61c9449ef614/id-preview-536512a2--81e402d5-14ed-48a5-938a-c89e014f695a.lovable.app-1778422430349.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

/**
 * Sub-componente isolato che hooka al location change e aggiorna il tag
 * `route` su Sentry. Estratto fuori dal RootComponent per non causare
 * re-render dell'intero albero ad ogni navigazione — `useRouterState`
 * con select restringe la subscription al solo pathname, quindi
 * RouteTracker re-render solo a vero cambio rotta.
 */
function RouteTracker() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    setSentryRouteTag(path);
  }, [path]);
  return null;
}

/**
 * Monta il FAB "Segnala problema" SOLO per utenti autenticati. Nascosto
 * sulle pagine /auth e durante il loading iniziale per evitare di
 * mostrare un button "Segnala" quando il database non risponderebbe
 * comunque (RLS richiede auth.uid()).
 */
function AuthenticatedBugReportFAB() {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (loading || !user) return null;
  if (path.startsWith("/auth")) return null;
  return <BugReportFAB />;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Init Sentry una sola volta lato client. No-op se VITE_SENTRY_DSN
  // non è settato (dev locale, staging senza quota).
  useEffect(() => {
    initSentry();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouteTracker />
        <Outlet />
        <AuthenticatedBugReportFAB />
        <Toaster richColors position="top-right" />
        <PwaRegister />
      </AuthProvider>
    </QueryClientProvider>
  );
}
