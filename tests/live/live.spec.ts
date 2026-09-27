import { expect, test } from "@playwright/test";
import { ask, composer } from "../browser/helpers";

/** Real API (fixture provider): streaming, stop, history, deletion, both surfaces. */
const HARNESS = "http://localhost:3210";

async function open(page: import("@playwright/test").Page) {
  await page.goto(HARNESS);
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await expect(page.locator("#status")).toHaveText("Conectado");
  return page.frameLocator("#panel iframe");
}

test("embedded: a real streamed answer completes and renders", async ({ page }, testInfo) => {
  const frame = await open(page);
  await ask(frame, "Mi hija tiene 4 años y recién empieza con las letras, ¿qué me recomiendas?");
  await expect(frame.getByRole("button", { name: "Detener respuesta" })).toBeVisible();
  await expect(frame.getByRole("button", { name: "Enviar pregunta" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(frame.getByText("No pude completar la respuesta.")).toHaveCount(0);
  const answer = frame.locator("ol[aria-label='Conversación con el asistente'] > li").last();
  await expect(answer).not.toBeEmpty();
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-answer.png`) });
  if (process.env.SCREENSHOTS === "1" && testInfo.project.name === "live-chromium")
    await page.screenshot({
      path: "docs/verification/screenshots/live-chromium-embed-real-api.png",
    });
});

test("embedded: stop cancels the real run and retry completes", async ({ page }) => {
  const frame = await open(page);
  await ask(frame, "¿Cómo se usa el kit en casa, día a día?");
  await frame.getByRole("button", { name: "Detener respuesta" }).click();
  await expect(frame.getByText("Detuviste la respuesta.")).toBeVisible();
  await frame.getByRole("button", { name: "Reintentar" }).click();
  await expect(frame.getByRole("button", { name: "Enviar pregunta" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(frame.getByText("Detuviste la respuesta.")).toHaveCount(0);
});

test("history survives a reload and appears in the standalone page; clearing deletes it", async ({
  page,
}) => {
  const frame = await open(page);
  const question = "¿Qué incluye exactamente la compra?";
  await ask(frame, question);
  await expect(frame.getByRole("button", { name: "Enviar pregunta" })).toBeVisible({
    timeout: 30_000,
  });
  await page.reload();
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  await expect(frame.getByText(question, { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nueva conversación" }).click();
  await page.getByRole("button", { name: "Borrar" }).click();
  await expect(page.getByRole("heading", { name: "¡Hola! ¿En qué te ayudo?" })).toBeVisible();
  await expect(composer(page)).toBeEnabled();
  await page.reload();
  await expect(page.getByText(question, { exact: true })).toHaveCount(0);
});
