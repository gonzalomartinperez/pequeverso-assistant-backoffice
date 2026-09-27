import { expect, test } from "@playwright/test";
import { ask, capture, composer, expectNoAxeViolations, HARNESS, resetMock } from "./helpers";

/** Secondary surface: the same conversation implementation inside a page frame. */
test.beforeEach(async ({ page }) => {
  await resetMock(page);
});

test.describe("standalone assistant @mobile", () => {
  test("renders the store identity and a working conversation", async ({ page }, testInfo) => {
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: /pequeverso — Volver a la tienda/ }),
    ).toHaveAttribute("href", HARNESS);
    await expect(page.getByRole("heading", { name: "¡Hola! ¿En qué te ayudo?" })).toBeVisible();
    await capture(page, testInfo, "standalone-empty");
    await ask(page, "¿Qué incluye?");
    await expect(page.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    await expect(composer(page)).toBeEnabled();
    await capture(page, testInfo, "standalone-answer");
    await expectNoAxeViolations(page);
  });

  test("exposes no embed panel controls or diagnostics", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "¡Hola! ¿En qué te ayudo?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Minimizar asistente" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ampliar panel" })).toHaveCount(0);
    const text = await page.locator("body").innerText();
    for (const internal of ["csrf", "session", "run_", "debug", "localhost:8207", "mock"])
      expect(text.toLowerCase()).not.toContain(internal);
  });

  test("theme toggle switches to dark and persists across reloads", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Usar tema oscuro" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await ask(page, "¿Qué incluye?");
    await expect(page.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    await capture(page, testInfo, "standalone-dark");
    await expectNoAxeViolations(page);
  });

  test("history is shared with the embedded surface through the same session cookie", async ({
    page,
  }) => {
    await page.goto("/");
    await ask(page, "¿Qué incluye?");
    await expect(page.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    await page.goto(HARNESS);
    await page.getByRole("button", { name: "Asistente", exact: true }).click();
    await expect(
      page.frameLocator("#panel iframe").getByRole("article", { name: "Grafismo Fonético" }),
    ).toBeVisible();
  });
});
