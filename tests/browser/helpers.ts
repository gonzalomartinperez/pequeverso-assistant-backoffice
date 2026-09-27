import AxeBuilder from "@axe-core/playwright";
import { expect, type FrameLocator, type Page, type TestInfo } from "@playwright/test";

export const HARNESS = "http://localhost:3210";
export const MOCK = "http://127.0.0.1:8207";

/** Resets the mock API (sessions, availability, failures) before each test. */
export async function resetMock(page: Page) {
  await page.request.post(`${MOCK}/__mock/reset`);
}

export async function mock(page: Page, route: string, body: unknown) {
  await page.request.post(`${MOCK}/__mock/${route}`, { data: body });
}

/** Opens the storefront harness and the assistant panel; returns the iframe locator. */
export async function openPanel(page: Page, query = ""): Promise<FrameLocator> {
  await page.goto(`${HARNESS}/${query}`);
  await page.getByRole("button", { name: "Asistente", exact: true }).click();
  const frame = page.frameLocator("#panel iframe");
  await expect(page.locator("#status")).toHaveText("Conectado");
  return frame;
}

/** Either the standalone page or the embedded frame: both expose the same roles. */
type Surface = Pick<Page | FrameLocator, "getByRole">;

export function composer(frame: Surface) {
  return frame.getByRole("textbox", { name: "Escribe tu pregunta" });
}

export async function ask(frame: Surface, question: string) {
  await composer(frame).fill(question);
  await composer(frame).press("Enter");
}

/** The assistant document inside the panel, for evaluating in-frame state. */
export async function assistantFrame(page: Page) {
  const handle = await page.locator("#panel iframe").elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) throw new Error("assistant frame not attached");
  return frame;
}

/** WCAG 2.2 A/AA automated scan of the assistant document (a subset of accessibility review). */
export async function expectNoAxeViolations(page: Page, include?: string) {
  const builder = new AxeBuilder({ page }).withTags([
    "wcag2a",
    "wcag2aa",
    "wcag21a",
    "wcag21aa",
    "wcag22aa",
  ]);
  if (include) builder.include(include);
  const results = await builder.analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/** Curated acceptance set committed under docs/verification/screenshots (embedded first). */
const DOCUMENTED = new Set([
  "chromium-embed-empty",
  "chromium-embed-answer",
  "chromium-embed-expanded",
  "chromium-embed-dark",
  "chromium-embed-stopped",
  "chromium-embed-failed",
  "chromium-embed-unavailable",
  "chromium-embed-zoom-reduced-motion",
  "firefox-embed-answer",
  "webkit-embed-answer",
  "mobile-chromium-embed-empty",
  "mobile-webkit-embed-mobile-answer",
  "chromium-standalone-empty",
  "chromium-standalone-answer",
  "chromium-standalone-dark",
  "mobile-webkit-standalone-answer",
]);

/** Saves a review screenshot under test-results; SCREENSHOTS=1 refreshes the documented set. */
export async function capture(page: Page, testInfo: TestInfo, name: string) {
  const id = `${testInfo.project.name}-${name}`;
  await page.screenshot({ path: testInfo.outputPath(`${id}.png`) });
  if (process.env.SCREENSHOTS === "1" && DOCUMENTED.has(id))
    await page.screenshot({ path: `docs/verification/screenshots/${id}.png` });
}
