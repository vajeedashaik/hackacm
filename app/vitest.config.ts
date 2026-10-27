import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // src/sim tests use node:test and *.test.mjs use node:test (run with `node --test`), not vitest; e2e/ is Playwright
  test: { environment: "node", exclude: [...configDefaults.exclude, "src/sim/**", "e2e/**", "**/*.test.mjs"] },
});
