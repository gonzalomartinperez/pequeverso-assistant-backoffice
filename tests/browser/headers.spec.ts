import { expect, test } from "@playwright/test";
import { HARNESS } from "./helpers";

/** Framing and security headers set by the application (docs/embed-integration.md). */
test("the embed route allows only the configured host origin to frame it", async ({ request }) => {
  const response = await request.get("/embed");
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toContain(`frame-ancestors ${HARNESS}`);
  expect(csp).not.toContain("*");
  expect(response.headers()["x-frame-options"]).toBeUndefined();
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});

test("every other page refuses framing", async ({ request }) => {
  for (const path of ["/", "/healthz"]) {
    const response = await request.get(path);
    expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
  }
});

test("health reports the frontend process only", async ({ request }) => {
  const response = await request.get("/healthz");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("a non-allowlisted origin cannot frame the assistant", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "frame-ancestors enforcement is checked once");
  // 127.0.0.1:3210 serves the same harness but is a different origin from localhost:3210.
  await page.goto("http://127.0.0.1:3210/");
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await expect(page.getByText("El asistente no está disponible ahora.")).toBeVisible({
    timeout: 15_000,
  });
});
