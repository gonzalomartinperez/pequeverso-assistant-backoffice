import { expect, test } from "@playwright/test";

// Dashboard against a RUNNING pequeverso-assistant-api (fixture provider, no paid calls):
//   LIVE_OPS_URL=http://127.0.0.1:8257 LIVE_OPS_TOKEN=… npm run test:browser -- live-ops.spec.ts
// Skipped otherwise. The API's data is real bookkeeping of fixture runs, labelled synthetic.
test.skip(!process.env.LIVE_OPS_URL, "LIVE_OPS_URL not set");

test("reads the real API ops summary over HTTP and labels fixture data as synthetic", async ({
  page,
}, info) => {
  await fetch("http://127.0.0.1:8238/__identity", {
    method: "POST",
    body: JSON.stringify({ email: "owner@example.test", sub: "owner" }),
  });
  await page.goto("/ingresar");
  const button = page.getByRole("button", { name: "Continuar con Proveedor de prueba" });
  await expect(button).toBeEnabled();
  await button.click();
  await page.waitForURL(/\/panel$/);
  await expect(page.getByRole("alert").filter({ hasText: "Métricas no disponibles" })).toHaveCount(
    0,
  );
  await expect(page.getByTestId("synthetic-banner")).toBeVisible();
  await expect(page.getByText("ae6d237877c248551be988af9be920eac69b16da")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solicitudes · Últimas 24 horas" })).toBeVisible();
  await expect(page.getByTestId("pricing")).toContainText("No es la factura del proveedor");
  await expect(
    page.getByRole("region", { name: "Últimas ejecuciones" }).getByRole("row"),
  ).not.toHaveCount(1);
  if (info.project.name === "chromium")
    await page.screenshot({
      path: "docs/verification/backoffice/desktop-dashboard-real-api.png",
      fullPage: true,
    });
});
