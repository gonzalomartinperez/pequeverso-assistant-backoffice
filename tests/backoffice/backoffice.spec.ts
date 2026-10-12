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
  // Audit a settled page: right after a server action React may be mid-commit (Firefox has shown
  // a transient empty <title> then). A page whose title never appears still fails here.
  await page.waitForLoadState("load");
  await expect(page).toHaveTitle(/\S/);
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
  const overview = page.getByRole("region", { name: "¿Puede responder ahora?", exact: true });
  await expect(overview.getByText("PRESUPUESTO RESTANTE DEL MES", { exact: true })).toBeVisible();
  await expect(overview.getByText("RESPUESTAS COMPLETADAS · 24 H", { exact: true })).toBeVisible();
  await expect(overview.getByText("PRIMER TEXTO · P95 · 24 H", { exact: true })).toBeVisible();
  // Technical data is available through a real disclosure, not removed or eagerly overwhelming.
  const diagnostic = page.getByText("Diagnóstico técnico y configuración", { exact: true });
  await expect(diagnostic.locator("..")).not.toHaveAttribute("open");
  await diagnostic.focus();
  await page.keyboard.press("Enter");
  await expect(diagnostic.locator("..")).toHaveAttribute("open", "");
  await expect(page.getByRole("heading", { name: "Estado técnico", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(diagnostic.locator("..")).not.toHaveAttribute("open");

  const mobile = info.project.name.startsWith("mobile");
  if (!mobile)
    await expect(page.getByTestId("actor")).toContainText("owner@example.test · propietario");
  else await expect(page.getByTestId("actor-role")).toHaveText("Propietario");
  await expect(page.getByRole("heading", { name: "Presupuesto de 2026-10" })).toBeVisible();
  // The fixture deliberately reports a historical budget day: never imply it is today's spend.
  const budgetTable = page.getByRole("region", { name: "Gasto del mes y del día" });
  await expect(budgetTable.getByRole("columnheader", { name: /Día \(2026-10-05\)/ })).toBeVisible();
  await expect(budgetTable).not.toContainText("Hoy (");
  for (const [label, month, day] of [
    ["Con uso informado", "US$ 0,4123", "US$ 0,0612"],
    ["Estimado", "US$ 0,0180", "US$ 0,0000"],
    ["Pendiente", "US$ 0,0054", "US$ 0,0054"],
    ["Límite", "US$ 10,00", "US$ 1,00"],
  ] as const) {
    const row = budgetTable
      .getByRole("row")
      .filter({ has: page.getByRole("rowheader", { name: label, exact: true }) });
    await expect(row.getByRole("cell")).toHaveText([month, day]);
  }
  await expect(
    page.getByRole("region", { name: "Presupuesto de 2026-10", exact: true }),
  ).toContainText("no la factura del proveedor");

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
    await page
      .getByRole("region", { name: "Actividad diaria", exact: true })
      .screenshot({ path: `${SHOTS}/mobile-dashboard-daily.png` });
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
  const attempt = `${info.project.name}-${info.repeatEachIndex}-${info.retry}`;
  const email = `viewer-${attempt}@example.test`;
  await signIn(page, "owner@example.test", "owner");
  await page.goto("/panel/accesos");
  await page.getByLabel("E-mail verificado de la persona").fill(email);
  await page.getByRole("button", { name: "Crear invitación" }).click();
  const link = (await page.getByTestId("invitation-link").textContent())?.trim() ?? "";
  expect(link).toMatch(/^http:\/\/localhost:3241\/invitacion\/[A-Za-z0-9_-]{43}$/);
  await axe(page);
  if (info.project.name === "chromium") {
    // Keep the opaque invitation URL only in test memory, never in a public screenshot.
    await page.reload();
    await expect(page.getByTestId("invitation-link")).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "Invitaciones" })
        .getByRole("row", { name: new RegExp(email) }),
    ).toContainText("Pendiente");
    await page.screenshot({ path: `${SHOTS}/desktop-access.png`, fullPage: true });
  }

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

test("analytics cards and disclosures reflow with 200 percent text @mobile", async ({ page }) => {
  await signIn(page, "owner@example.test", "owner");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(() =>
      Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    ),
  ).toBe(32);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole("region", { name: "¿Puede responder ahora?", exact: true }),
    ).toBeVisible();
    const diagnostic = page.getByText("Diagnóstico técnico y configuración", { exact: true });
    await diagnostic.click();
    await expect(page.getByRole("heading", { name: "Estado técnico", exact: true })).toBeVisible();
    const reflow = await page.evaluate(() => {
      const root = document.documentElement;
      // Content-free structural diagnostics; deliberately omit text, URLs, ids and tokens.
      const structuralOverflow = [
        ...document.querySelectorAll("header, nav, main, section, div, span"),
      ]
        .filter((element) => {
          let ancestor: Element | null = element;
          while (ancestor) {
            if (["auto", "scroll"].includes(getComputedStyle(ancestor).overflowX)) return false;
            ancestor = ancestor.parentElement;
          }
          return element.getBoundingClientRect().right + window.scrollX > root.clientWidth + 1;
        })
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          classes: element.className,
          right: Math.round(element.getBoundingClientRect().right + window.scrollX),
        }));
      return { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth, structuralOverflow };
    });
    expect(reflow.scrollWidth, JSON.stringify(reflow)).toBeLessThanOrEqual(reflow.clientWidth + 1);
    await diagnostic.click();
  }
  expect(await cspViolations(page)).toEqual([]);
});

test("technical observation stays honest, accessible and separate from provider availability @mobile", async ({
  page,
}, info) => {
  await signIn(page, "owner@example.test", "owner");
  await page.getByText("Diagnóstico técnico y configuración", { exact: true }).click();
  const technical = page.getByRole("region", { name: "Estado técnico" });
  const fixtureNotice = technical.getByTestId("telemetry-fixture-banner");
  await expect(fixtureNotice).toContainText("Proveedor de prueba (fixture)");
  await expect(fixtureNotice).toContainText("La muestra informa HTTP y recursos del proceso");
  await expect(fixtureNotice).toContainText(
    "no acredita disponibilidad de OpenAI ni calidad del modelo",
  );
  await expect(technical).toContainText("API preparada");
  await expect(technical).toContainText("Proveedor: sin comprobar");
  await expect(technical).toContainText("0 / 4 ejecuciones activas");
  await technical.locator("summary").click();
  await expect(technical.getByText("Memoria RSS del proceso").locator("..")).toContainText(
    "No disponible",
  );
  await expect(technical).toContainText("no incluyen fallos SSE enviados dentro de HTTP 200");
  await axe(page);
  expect(await cspViolations(page)).toEqual([]);
  const html = await page.content();
  expect(html).not.toContain("test-observability-token-separate");
  expect(html).not.toContain("test-ops-read-token");
  if (info.project.name === "chromium")
    await page.screenshot({ path: `${SHOTS}/desktop-telemetry-detail.png`, fullPage: true });
});

test("disabled or invalid optional telemetry preserves valid legacy spend and runs", async ({
  page,
}) => {
  await signIn(page, "owner@example.test", "owner");
  for (const name of ["telemetry-off", "telemetry-invalid"]) {
    await variant(name);
    await page.goto("/panel");
    await page.getByText("Diagnóstico técnico y configuración", { exact: true }).click();
    const technical = page.getByRole("region", { name: "Estado técnico" });
    await expect(technical).toContainText("No disponible");
    await expect(page.getByRole("heading", { name: "Presupuesto de 2026-10" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Solicitudes · Últimas 24 horas" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Gasto del mes y del día" })).toContainText(
      "US$ 0,4123",
    );
  }
});

test("private machine metrics require a separate bearer and expose no credentials", async ({
  request,
}) => {
  const path = "/internal/v1/ops/metrics";
  expect((await request.get(path)).status()).toBe(401);
  expect((await request.get(path, { headers: { Authorization: "Bearer wrong" } })).status()).toBe(
    401,
  );
  const response = await request.get(path, {
    headers: { Authorization: "Bearer test-observability-token-separate-000000000000" },
  });
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const metrics = await response.text();
  expect(metrics).toContain("pequeverso_backoffice_operation_total");
  expect(metrics).toContain("pequeverso_backoffice_process_resident_memory_bytes");
  expect(metrics).not.toMatch(
    /owner@example|test-ops-read-token|test-observability-token|invitacion|8237/,
  );
});
