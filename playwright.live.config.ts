import { defineConfig, devices } from "@playwright/test";

/**
 * Joint verification against a RUNNING pequeverso-assistant-api (fixture provider, no paid
 * calls) behind the same-origin proxy on :3207, with the web app configured for the real
 * storefront origin and the harness on :3210. The stack is started outside Playwright; see
 * docs/verification.md#real-api-integration.
 */
export default defineConfig({
  testDir: "./tests/live",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3207", trace: "retain-on-failure" },
  projects: [
    { name: "live-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "live-webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
