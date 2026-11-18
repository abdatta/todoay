import { defineConfig, devices } from "@playwright/test";

// Runs against the production static export (run `npm run build` first, or
// use `npm run test:offline`), because the service worker only exists there.
const port = Number(process.env.PLAYWRIGHT_OFFLINE_PORT ?? 2022);

export default defineConfig({
  testDir: "./tests/offline",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx mcp/serve.ts",
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: {
      PORT: String(port),
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "example-anon-key",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
