import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Backend (src/server + supabase) tests. Kept separate from vitest.config.ts, which other suites own.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 30_000 },
});
