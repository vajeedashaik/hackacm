import { defineConfig } from "@playwright/test";

// Uses the installed Microsoft Edge so no browser download is needed.
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  workers: 1, // the in-memory store is process-wide
  use: { baseURL: "http://localhost:3112", channel: "msedge" },
  webServer: {
    command: "npm run build && npx next start -p 3112",
    url: "http://localhost:3112",
    timeout: 240_000,
    reuseExistingServer: true,
    env: { EMPLOYER_PIN: "1234" },
  },
});
