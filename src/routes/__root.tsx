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
  type ErrorComponentProps,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { ClientToaster } from "@/components/client-toaster";
import { PwaRegister } from "@/components/pwa-register";
import { startInstallCapture } from "@/hooks/use-pwa";
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

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Si è verificato un errore</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
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
      // viewport-fit a «cover» per tutta l'app (passata 12 del lato cliente,
      // nf-021): senza, su iPhone env(safe-area-inset-*) vale 0, e la barra in
      // basso del coach finiva sulla lineetta di sistema (misurato sul telefono
      // il 07/10/2026: le etichette a 15 punti dal fondo, la lineetta ne occupa
      // 34). Fino alla 11 stava solo sulle route del cliente (client.tsx), e
      // TanStack tiene, per ogni name, il meta della route più interna: le
      // pagine del coach, «/» e «/auth» restavano senza. Con «cover» la pagina
      // va anche sotto la tacca in orizzontale: i layout del coach
      // (trainer.tsx) e del cliente (client.tsx) tengono i margini di sinistra
      // e destra, la barra in basso, i toast, i fogli e i pannelli fissi
      // tengono la loro zona. Nell'app installata la barra di stato resta
      // «default» (nessun apple-mobile-web-app-status-bar-style): la pagina
      // comincia sotto di lei, e l'inset in alto in verticale vale 0.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
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
      // Il manifest dell'app (passata 08 del lato cliente): vite-plugin-pwa lo
      // pubblica in /manifest.webmanifest ma scrive questo link solo dentro un
      // index.html, che con TanStack Start non c'è. Senza, il telefono non sa
      // che è un'app (schermo intero, pagina di partenza, ambito), e su iPhone
      // le notifiche arrivano solo all'app aperta dall'icona della schermata
      // Home. Un href fisso e non virtual:pwa-info: quel modulo vuole un tipo
      // in più in tsconfig.json (vite-plugin-pwa/info), e l'indirizzo che dà è
      // questo stesso.
      { rel: "manifest", href: "/manifest.webmanifest" },
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

// La lingua del documento è l'italiano (passata 09 del lato cliente, WCAG
// 3.1.1): con «en» uno screen reader leggeva i testi con la voce inglese, sul
// lato cliente e su quello del coach (giusto per tutti e due).
function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
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

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // Init Sentry una sola volta lato client. No-op se VITE_SENTRY_DSN
  // non è settato (dev locale, staging senza quota).
  // L'invito del browser a installare arriva una volta, presto: si ascolta
  // da qui, così chi entra da /auth non lo perde (use-pwa.ts).
  useEffect(() => {
    initSentry();
    startInstallCapture();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouteTracker />
        <Outlet />
        {/* Un Toaster solo per tutta l'app: sulle route del cliente con le sue props. */}
        <ClientToaster />
        <PwaRegister />
      </AuthProvider>
    </QueryClientProvider>
  );
}
