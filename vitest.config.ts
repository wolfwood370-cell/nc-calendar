// Config dei test unitari, separata da vite.config.ts: quella di Lovable
// carica TanStack Start, Cloudflare e PWA, che agli helper puri non servono.
// vite-tsconfig-paths risolve l'alias `@/` letto da tsconfig.json.
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
