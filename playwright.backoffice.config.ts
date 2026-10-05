import { defineConfig, devices } from "@playwright/test";

const ci = Boolean(process.env.CI);

/**
 * Backoffice suite: the production build with a real PostgreSQL, the real Better Auth callback
 * flow against a local fake identity provider, and SYNTHETIC ops data from the mock ops API.
 * Proves access rules, rendering and accessibility; it does not prove Google/GitHub OAuth.
 */
export default defineConfig({
  testDir: "./tests/backoffice",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-backoffice" }]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:3241",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    command: "node scripts/backoffice-stack.ts",
    url: "http://localhost:3241/healthz",
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
