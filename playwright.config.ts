import { defineConfig, devices } from "@playwright/test";

const ci = Boolean(process.env.CI);

/**
 * Deterministic suite against the mock API and the storefront harness (scripts/test-server.ts).
 * The embedded experience is primary: most specs drive /embed through the cross-origin harness at
 * realistic panel sizes rather than opening /embed as a page.
 */
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: ci,
  retries: ci ? 1 : 0,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: "http://localhost:3207",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] }, grep: /@mobile/ },
  ],
  webServer: {
    command: "node scripts/test-server.ts",
    url: "http://localhost:3207/healthz",
    reuseExistingServer: !ci,
    timeout: 90_000,
  },
});
