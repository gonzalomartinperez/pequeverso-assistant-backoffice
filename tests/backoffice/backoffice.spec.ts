import AxeBuilder from "@axe-core/playwright";
import { type Browser, expect, type Page, test } from "@playwright/test";

const IDP = "http://127.0.0.1:8238";
const OPS = "http://127.0.0.1:8237";
const SHOTS = "docs/verification/backoffice";

async function identity(email: string, sub: string, verified = true) {
  await fetch(`${IDP}/__identity`, {
    method: "POST",
    body: JSON.stringify({ email, sub, email_verified: verified }),
  });
}

async function variant(name: string) {
  await fetch(`${OPS}/__variant?name=${name}`);
}

/** Records CSP violations so every test can assert the strict policy breaks nothing. */
async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = store;
    document.addEventListener("securitypolicyviolation", (event) => {
      store.push(`${event.violatedDirective} ${event.blockedURI}`);
    });
  });
}

async function cspViolations(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
}

async function signIn(page: Page, email: string, sub: string) {
  await identity(email, sub);
  await page.goto("/ingresar");
  await continueWithTestProvider(page);
  // The OAuth round trip ends on the panel or back on the sign-in page with an error.
  await page.waitForURL(/\/panel$|\/ingresar\?error=/);
}

async function continueWithTestProvider(page: Page) {
  const button = page.getByRole("button", { name: "Continuar con Proveedor de prueba" });
  await expect(button).toBeEnabled();
  await button.click();
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`),
  ).toEqual([]);
}

async function newPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await watchCsp(page);
  return page;
}

test.beforeEach(async ({ page }) => {
  await variant("full");
  await watchCsp(page);
});

test("sign-in page is private, unframable and accessible", async ({ page }, info) => {
  const response = await page.goto("/ingresar");
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toMatch(
    /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
  );
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["cache-control"]).toContain("no-store");
  expect(headers["x-robots-tag"]).toContain("noindex");
  await expect(
    page.getByRole("heading", { level: 1, name: "Backoffice del asistente" }),
  ).toBeVisible();
  await axe(page);
  expect(await cspViolations(page)).toEqual([]);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${SHOTS}/sign-in.png`, fullPage: true });
});

test("the panel redirects anonymous visitors to sign-in", async ({ page }) => {
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/ingresar$/);
  await page.goto("/panel/accesos");
  await expect(page).toHaveURL(/\/ingresar$/);
});

test("an uninvited identity in the owner's domain is refused", async ({ page }, info) => {
  await signIn(page, `stranger-${info.project.name}@example.test`, `stranger-${info.project.name}`);
  await expect(page).toHaveURL(/\/ingresar\?error=unable_to_create_user/);
  await expect(page.getByTestId("sign-in-error")).toContainText("no tiene acceso");
  await page.goto("/panel");
  await expect(page).toHaveURL(/\/ingresar$/);
});

test("owner dashboard shows labelled synthetic data, charts and accessible tables @mobile", async ({
  page,
}, info) => {
  await signIn(page, "owner@example.test", "owner");
  await expect(page).toHaveURL(/\/panel$/);
  await expect(page.getByRole("heading", { level: 1, name: "Estado del asistente" })).toBeVisible();
  await expect(page.getByTestId("synthetic-banner")).toContainText("Datos sintéticos (fixture)");
  const mobile = info.project.name.startsWith("mobile");
  if (!mobile)
    await expect(page.getByTestId("actor")).toContainText("owner@example.test · propietario");
  else await expect(page.getByTestId("actor-role")).toHaveText("Propietario");
  await expect(page.getByRole("heading", { name: "Presupuesto de 2026-10" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Gasto del mes y del día" })).toContainText(
    "US$ 0,4123",
  );
  await expect(page.getByRole("heading", { name: "Solicitudes · Últimas 24 horas" })).toBeVisible();
  await expect(page.getByText("Rechazadas antes de responder").first()).toBeVisible();
  await expect(
    page.getByTestId("chart-runs").locator(".recharts-bar-rectangle").first(),
  ).toBeVisible();
  await expect(
    page.getByTestId("chart-cost").locator(".recharts-bar-rectangle").first(),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Actividad diaria en tabla" }).getByRole("row"),
  ).toHaveCount(8);
  await axe(page);
  expect(await cspViolations(page)).toEqual([]);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${SHOTS}/desktop-dashboard.png`, fullPage: true });
  if (mobile) {
    await page.screenshot({ path: `${SHOTS}/mobile-dashboard-top.png` });
    await page.getByRole("heading", { name: "Actividad diaria" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/mobile-dashboard-daily.png` });
  }
  // No secret or private configuration reaches the browser.
  const html = await page.content();
  expect(html).not.toContain("test-ops-read-token");
  expect(html).not.toContain("127.0.0.1:8237");
});

test("dark theme keeps the dashboard readable and accessible", async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, "owner@example.test", "owner");
  await expect(page.getByTestId("synthetic-banner")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await axe(page);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${SHOTS}/desktop-dashboard-dark.png`, fullPage: true });
});

test("a single daily reading is a table without a trend chart", async ({ page }) => {
  await variant("single");
  await signIn(page, "owner@example.test", "owner");
  await expect(page.getByText("Hay una sola lectura diaria")).toBeVisible();
  await expect(page.getByTestId("chart-runs")).toHaveCount(0);
});

test("missing data is shown as not available, never as zero", async ({ page }, info) => {
  await variant("missing");
  await signIn(page, "owner@example.test", "owner");
  await expect(page.getByText("No acepta preguntas")).toBeVisible();
  await expect(page.getByText("Sin catálogo válido")).toBeVisible();
  await expect(
    page.getByText(/No disponible: la API no informó el estado del presupuesto/),
  ).toBeVisible();
  await expect(page.getByText(/No disponible: todavía no hay días con registros/)).toBeVisible();
  await axe(page);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${SHOTS}/desktop-missing-data.png`, fullPage: true });
});

test("an unreachable or rejecting API is reported without numbers", async ({ page }, info) => {
  await variant("down");
  await signIn(page, "owner@example.test", "owner");
  const alert = page.getByRole("alert").filter({ hasText: "Métricas no disponibles" });
  await expect(alert).toContainText("rechazó la lectura");
  await expect(page.getByTestId("synthetic-banner")).toHaveCount(0);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${SHOTS}/desktop-unavailable.png`, fullPage: true });
});

test("keyboard: skip link, navigation and focus are reachable", async ({ page }) => {
  await signIn(page, "owner@example.test", "owner");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#contenido$/);
  const nav = page.getByRole("navigation", { name: "Backoffice" });
  await nav.getByRole("link", { name: "Accesos" }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/panel\/accesos$/);
  await expect(nav.getByRole("link", { name: "Accesos" })).toHaveAttribute("aria-current", "page");
});

test("invitation lifecycle: invite, accept as viewer, read-only, revoke", async ({
  page,
  browser,
}, info) => {
  // Unique per attempt: a retry must not collide with the previous attempt's database rows.
  const attempt = `${info.project.name}-${info.retry}`;
  const email = `viewer-${attempt}@example.test`;
  await signIn(page, "owner@example.test", "owner");
  await page.goto("/panel/accesos");
  await page.getByLabel("E-mail verificado de la persona").fill(email);
  await page.getByRole("button", { name: "Crear invitación" }).click();
  const link = (await page.getByTestId("invitation-link").textContent())?.trim() ?? "";
  expect(link).toMatch(/^http:\/\/localhost:3241\/invitacion\/[A-Za-z0-9_-]{43}$/);
  await axe(page);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${SHOTS}/desktop-access.png`, fullPage: true });

  // Someone else with the link but another e-mail is refused, and the link still works afterwards.
  const intruder = await newPage(browser);
  await intruder.goto(link);
  await expect(intruder).toHaveURL(/\/ingresar\?invitacion=1$/);
  expect(intruder.url()).not.toContain("/invitacion/");
  await identity(`intruder-${attempt}@example.test`, `intruder-${attempt}`);
  await continueWithTestProvider(intruder);
  await expect(intruder).toHaveURL(/error=unable_to_create_user/);
  await intruder.context().close();

  const viewer = await newPage(browser);
  await viewer.goto(link);
  await identity(email, `viewer-${attempt}`);
  await continueWithTestProvider(viewer);
  await expect(viewer).toHaveURL(/\/panel$/);
  await expect(viewer.getByTestId("actor")).toContainText(`${email} · lectura`);
  await expect(
    viewer.getByRole("navigation", { name: "Backoffice" }).getByRole("link", { name: "Accesos" }),
  ).toHaveCount(0);
  await viewer.goto("/panel/accesos");
  await expect(viewer).toHaveURL(/\/panel$/);
  // Explicit linking is offered to owners only.
  await viewer.goto("/panel/cuenta");
  await expect(viewer.getByRole("button", { name: /Vincular/ })).toHaveCount(0);
  // No session material in browser storage.
  expect(
    await viewer.evaluate(() =>
      Object.keys(localStorage).filter((k) => /auth|session|token/i.test(k)),
    ),
  ).toEqual([]);

  // The link is spent.
  const late = await newPage(browser);
  await late.goto(link);
  await expect(late).toHaveURL(/error=invitation_invalid/);
  await late.context().close();

  // Revocation takes effect on the viewer's next request.
  await page.reload();
  const members = page.getByRole("region", { name: "Cuentas con acceso" });
  const row = members.getByRole("row", { name: new RegExp(email) });
  const trigger = row.getByRole("button", { name: `Quitar acceso ${email}` });
  // Escape cancels the modal and returns focus to its trigger.
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "¿Quitar el acceso?" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await axe(page);
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${SHOTS}/desktop-revoke-dialog.png` });
  await dialog.getByRole("button", { name: "Quitar acceso" }).click();
  await expect(dialog).toBeHidden();
  await expect(members.getByRole("row", { name: new RegExp(email) })).toHaveCount(0);
  await expect(page.locator("#members-title")).toBeFocused();
  await expect(
    page
      .getByRole("region", { name: "Invitaciones" })
      .getByRole("row", { name: new RegExp(email) }),
  ).toContainText("Aceptada");
  await viewer.goto("/panel");
  await expect(viewer).toHaveURL(/\/ingresar$/);
  await viewer.context().close();
});
