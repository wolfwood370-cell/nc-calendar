// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      // Pre-extraction baseline: router-*.js = 1051 KB, server-*.js = 727 KB
      // (both above Vite's 500 KB warning threshold). Splitting heavy
      // vendor groups into their own chunks reduces the initial parse
      // cost for first-paint, and keeps the router chunk reusable
      // across pages so per-route caching stays effective.
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            if (!id.includes("node_modules")) return undefined;
            // Lucide ships ~1000 SVG components — keeping them in a
            // dedicated chunk avoids re-bundling the whole icon set
            // into every route file.
            if (id.includes("lucide-react")) return "vendor-lucide";
            // Radix UI primitives are split across many tiny packages,
            // but they all rev together — grouping them avoids the
            // long-tail of micro-chunks.
            if (id.includes("@radix-ui/")) return "vendor-radix";
            // date-fns + its locales sit at ~80 KB combined.
            if (id.includes("date-fns")) return "vendor-datefns";
            // Supabase auth + postgrest + realtime — heavy on the
            // initial JS payload but rarely changes.
            if (id.includes("@supabase/")) return "vendor-supabase";
            return undefined;
          },
        },
      },
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        devOptions: { enabled: false },
        manifest: {
          name: "NC Calendar",
          short_name: "NC Calendar",
          description: "Studio personal trainer — prenotazioni e blocchi di allenamento.",
          theme_color: "#3b82f6",
          background_color: "#3b82f6",
          display: "standalone",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/favicon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
          ],
        },
        // Passata 08: l'icona del manifest (favicon.png, 1,9 MB) non va in
        // precache, o si riscaricherebbe a ogni installazione del service worker.
        includeManifestIcons: false,
        // Il service worker serve alle notifiche sul telefono (push-sw.js), e
        // basta: niente file della build, niente pagine (passata 08, misurato
        // il 04/10/2026 sulla build di Lovable e in produzione).
        workbox: {
          // Nella build di Lovable il client sta in dist/client e sw.js in
          // dist: le voci della precache uscivano col prefisso «client/» e
          // rispondevano 404 (85 su 87 in produzione), una voce in 404 fa
          // fallire tutta l'installazione (bad-precaching-response) e il
          // service worker non partiva mai. Con [] in precache resta solo il
          // manifest, che il plugin aggiunge da sé.
          globPatterns: [],
          // Il plugin mette di suo «index.html», che un'app SSR non ha: la
          // NavigationRoute verso un indirizzo fuori dalla precache lancia
          // non-precached-url e ferma il resto del service worker.
          navigateFallback: null,
          // Niente runtimeCaching: la NetworkFirst sulle pagine non è mai
          // partita in produzione (la fermava l'errore di sopra), e accesa
          // adesso darebbe, dopo 3 secondi di rete lenta, una pagina vecchia
          // coi file di una build che non c'è più, anche al ritorno
          // dall'accesso con Google (/~oauth), senza vantaggi fuori rete.
          importScripts: ["/push-sw.js"],
        },
      }),
    ],
  },
});
