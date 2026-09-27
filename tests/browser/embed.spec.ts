import { expect, test } from "@playwright/test";
import {
  ask,
  assistantFrame,
  capture,
  composer,
  expectNoAxeViolations,
  HARNESS,
  mock,
  openPanel,
  resetMock,
} from "./helpers";

/**
 * Embedded experience, always through the cross-origin storefront harness (localhost:3210 framing
 * localhost:3207/embed) at realistic panel sizes.
 */
test.beforeEach(async ({ page }) => {
  await resetMock(page);
});

test.describe("embedded assistant @mobile", () => {
  test("creates the iframe on first open, becomes ready and hands focus to the frame", async ({
    page,
    isMobile,
    browserName,
  }, testInfo) => {
    await page.goto(HARNESS);
    await expect(page.locator("#panel iframe")).toHaveCount(0);
    await page.getByRole("button", { name: "Asistente", exact: true }).click();
    const frame = page.frameLocator("#panel iframe");
    await expect(page.locator("#status")).toHaveText("Conectado");
    await expect(frame.getByRole("heading", { name: "¡Hola! ¿En qué te ayudo?" })).toBeVisible();
    // Focus always enters the frame. The composer takes it for keyboard/mouse users, except where
    // WebKit forbids focus moves inside a cross-origin frame without a gesture; touch devices keep
    // the keyboard closed until the visitor taps the field.
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
    if (isMobile || browserName === "webkit") await expect(composer(frame)).not.toBeFocused();
    else await expect(composer(frame)).toBeFocused();
    await capture(page, testInfo, "embed-empty");
  });

  test("answers with a verified product card, sources and follow-ups", async ({
    page,
  }, testInfo) => {
    const frame = await openPanel(page);
    await frame.getByRole("button", { name: "¿Qué incluye Grafismo Fonético?" }).click();
    const card = frame.getByRole("article", { name: "Grafismo Fonético" });
    await expect(card).toBeVisible();
    await expect(card.getByText("US$14,99")).toBeVisible();
    await expect(card.getByText(/Precio confirmado el/)).toBeVisible();
    await expect(card.getByRole("link", { name: /Cómo comprar/ })).toHaveAttribute(
      "href",
      `${HARNESS}/grafismo-fonetico/#comprar`,
    );
    await expect(card.getByRole("link", { name: /Cómo comprar/ })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    await expect(frame.getByRole("button", { name: "¿Necesito imprimir todo?" })).toBeEnabled();
    await frame.getByText("2 fuentes").click();
    await expect(frame.getByRole("link", { name: /Entrega digital/ })).toBeVisible();
    await capture(page, testInfo, "embed-answer");
    await expectNoAxeViolations(page);
  });

  test("keeps the composer visible and usable in the mobile panel", async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(!isMobile, "mobile layout");
    const frame = await openPanel(page);
    const panel = await page.locator("#panel").boundingBox();
    const viewport = page.viewportSize();
    expect(panel?.width).toBe(viewport?.width);
    expect(panel?.height).toBeGreaterThan((viewport?.height ?? 0) * 0.9);
    await ask(frame, "¿Qué incluye?");
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    const box = await composer(frame).boundingBox();
    expect(box && box.y + box.height).toBeLessThanOrEqual(viewport?.height ?? 0);
    // Touch targets of the panel controls are at least 44×44 CSS px.
    for (const name of ["Nueva conversación", "Minimizar asistente", "Enviar pregunta"]) {
      const target = await frame.getByRole("button", { name }).boundingBox();
      expect(target?.width).toBeGreaterThanOrEqual(40);
      expect(target?.height).toBeGreaterThanOrEqual(40);
    }
    await capture(page, testInfo, "embed-mobile-answer");
  });
});

test.describe("panel continuity", () => {
  test("minimize and reopen keep the same iframe document and conversation", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "¿Qué incluye?");
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    const inner = await assistantFrame(page);
    await inner.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 42;
    });
    await frame.getByRole("button", { name: "Minimizar asistente" }).click();
    await expect(page.locator("#panel")).toBeHidden();
    await expect(page.getByRole("button", { name: "Asistente", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Asistente", exact: true }).click();
    await expect(page.locator("#panel iframe")).toHaveCount(1);
    expect(
      await (await assistantFrame(page)).evaluate(
        () => (window as unknown as { __marker?: number }).__marker,
      ),
    ).toBe(42);
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
  });

  test("expand and restore resize the panel without remounting", async ({ page }, testInfo) => {
    const frame = await openPanel(page);
    await ask(frame, "¿Qué incluye?");
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    const inner = await assistantFrame(page);
    await inner.evaluate(() => {
      (window as unknown as { __marker: number }).__marker = 7;
    });
    const compact = await page.locator("#panel").boundingBox();
    await frame.getByRole("button", { name: "Ampliar panel" }).click();
    await expect(frame.getByRole("button", { name: "Reducir panel" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect
      .poll(async () => (await page.locator("#panel").boundingBox())?.width)
      .toBeGreaterThan((compact?.width ?? 0) + 200);
    await capture(page, testInfo, "embed-expanded");
    await frame.getByRole("button", { name: "Reducir panel" }).click();
    await expect
      .poll(async () => (await page.locator("#panel").boundingBox())?.width)
      .toBe(compact?.width);
    expect(
      await (await assistantFrame(page)).evaluate(
        () => (window as unknown as { __marker?: number }).__marker,
      ),
    ).toBe(7);
  });

  test("keeps streaming while minimized and badges the launcher as unread", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "respuesta lenta");
    await expect(frame.getByRole("button", { name: "Detener respuesta" })).toBeVisible();
    await frame.getByRole("button", { name: "Minimizar asistente" }).click();
    await expect(page.locator("#badge")).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("#badge-text")).toHaveText("Nueva respuesta del asistente");
    await page.getByRole("button", { name: "Asistente", exact: true }).click();
    await expect(page.locator("#badge")).toBeHidden();
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
  });

  test("the hidden panel is inert and out of the tab order", async ({ page }) => {
    const frame = await openPanel(page);
    await frame.getByRole("button", { name: "Minimizar asistente" }).click();
    await expect(page.locator("#panel")).toHaveJSProperty("inert", true);
    await page.getByRole("button", { name: "Botón de la página" }).focus();
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const inFrame = await page.evaluate(() => document.activeElement?.tagName === "IFRAME");
      expect(inFrame).toBe(false);
    }
  });
});

test.describe("keyboard and focus across the frame boundary", () => {
  test("Escape inside the assistant minimizes and restores focus to the launcher", async ({
    page,
  }) => {
    const frame = await openPanel(page);
    await composer(frame).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#panel")).toBeHidden();
    await expect(page.getByRole("button", { name: "Asistente", exact: true })).toBeFocused();
  });

  test("Escape in the clear confirmation closes only the confirmation", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "¿Qué incluye?");
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    await frame.getByRole("button", { name: "Nueva conversación" }).click();
    await expect(frame.getByRole("dialog", { name: "¿Empezar de nuevo?" })).toBeVisible();
    await expect(frame.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(frame.getByRole("dialog")).toBeHidden();
    await expect(page.locator("#panel")).toBeVisible();
    await expect(frame.getByRole("button", { name: "Nueva conversación" })).toBeFocused();
  });

  test("keyboard-only: open with Enter, ask, Tab to follow-ups and Shift+Tab back", async ({
    page,
    browserName,
  }) => {
    await page.goto(HARNESS);
    await page.getByRole("button", { name: "Asistente", exact: true }).focus();
    await page.keyboard.press("Enter");
    const frame = page.frameLocator("#panel iframe");
    await expect(composer(frame)).toBeFocused();
    await page.keyboard.type("¿Qué incluye?");
    await page.keyboard.press("Enter");
    await expect(frame.getByRole("button", { name: "¿Por cuál recurso empiezo?" })).toBeVisible();
    // Shift+Tab from the composer walks back into the transcript controls. WebKit, like Safari's
    // default setting, only tabs to form controls, so this step applies to the other engines.
    test.skip(browserName === "webkit", "WebKit does not Tab to buttons by default");
    await page.keyboard.press("Shift+Tab");
    await expect(frame.getByRole("button", { name: "¿Cómo funciona la garantía?" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(frame.getByText("¿Cómo funciona la garantía?").first()).toBeVisible();
  });

  test("clearing the conversation deletes history and returns focus to the composer", async ({
    page,
  }) => {
    const frame = await openPanel(page);
    await ask(frame, "¿Qué incluye?");
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    await frame.getByRole("button", { name: "Nueva conversación" }).click();
    await frame.getByRole("button", { name: "Borrar" }).click();
    await expect(frame.getByRole("heading", { name: "¡Hola! ¿En qué te ayudo?" })).toBeVisible();
    await expect(composer(frame)).toBeFocused();
  });
});

test.describe("streaming, cancellation and failures", () => {
  test("stop keeps the partial answer and offers retry", async ({ page }, testInfo) => {
    const frame = await openPanel(page);
    await ask(frame, "respuesta lenta");
    const stop = frame.getByRole("button", { name: "Detener respuesta" });
    await expect(frame.getByText("Grafismo Fonético", { exact: false }).first()).toBeVisible();
    await stop.click();
    await expect(frame.getByText("Detuviste la respuesta.")).toBeVisible();
    await expect(frame.getByText("Respuesta incompleta")).toBeVisible();
    await capture(page, testInfo, "embed-stopped");
    await frame.getByRole("button", { name: "Reintentar" }).click();
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(frame.getByText("Detuviste la respuesta.")).toBeHidden();
  });

  test("an interrupted stream is reported honestly", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "interrumpir por favor");
    await expect(
      frame.getByText("Se cortó la conexión antes de terminar la respuesta."),
    ).toBeVisible();
    await expect(frame.getByText("La respuesta empieza a llegar")).toBeVisible();
    await expect(frame.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });

  test("a failed run explains the error and can be retried", async ({ page }, testInfo) => {
    const frame = await openPanel(page);
    await ask(frame, "esto falla");
    await expect(frame.getByText("No pude completar la respuesta.")).toBeVisible();
    await expect(frame.getByText("No pude generar la respuesta. Puedes reintentar.")).toBeVisible();
    await capture(page, testInfo, "embed-failed");
  });

  test("a busy refusal returns the question to the composer", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "estás ocupado?");
    await expect(frame.getByText("El asistente está ocupado.", { exact: false })).toBeVisible();
    await expect(composer(frame)).toHaveValue("estás ocupado?");
  });

  test("an expired session reopens with a notice and keeps the question", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "esto va a expirar");
    await expect(
      frame.getByText("Tu conversación anterior expiró.", { exact: false }),
    ).toBeVisible();
    await expect(composer(frame)).toHaveValue("esto va a expirar");
  });

  test("budget exhaustion disables questions but keeps the store usable", async ({
    page,
  }, testInfo) => {
    const frame = await openPanel(page);
    await ask(frame, "presupuesto");
    await expect(frame.getByText("El asistente no está disponible en este momento.")).toBeVisible();
    await expect(composer(frame)).toHaveCount(0);
    await expect(frame.getByRole("link", { name: /Ir a Soporte/ })).toHaveAttribute(
      "href",
      `${HARNESS}/soporte/`,
    );
    await capture(page, testInfo, "embed-unavailable");
    await page.getByRole("button", { name: "Botón de la página" }).click({ force: true });
  });

  test("an unreachable API shows an offline state with reconnect", async ({ page }) => {
    await mock(page, "session-failure", { enabled: true });
    await page.goto(HARNESS);
    await page.getByRole("button", { name: "Asistente", exact: true }).click();
    const frame = page.frameLocator("#panel iframe");
    await expect(frame.getByText("No pudimos conectar con el asistente.")).toBeVisible();
    await mock(page, "session-failure", { enabled: false });
    await frame.getByRole("button", { name: "Reintentar conexión" }).click();
    await expect(frame.getByRole("heading", { name: "¡Hola! ¿En qué te ayudo?" })).toBeVisible();
  });

  test("an unavailable iframe falls back in the host without breaking the page", async ({
    page,
  }) => {
    await page.goto(HARNESS);
    await page.getByRole("button", { name: "Simular asistente caído" }).click();
    await page.getByRole("button", { name: "Asistente", exact: true }).click();
    await expect(page.getByText("El asistente no está disponible ahora.")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("button", { name: "Botón de la página" }).click();
  });

  test("does not force-scroll while the reader is reviewing earlier content", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "respuesta larga");
    await expect(frame.getByText("Parte 3.")).toBeVisible();
    const inner = await assistantFrame(page);
    const scroller = inner.locator("ol[aria-label='Conversación con el asistente']").locator("..");
    await scroller.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(frame.getByRole("button", { name: "Ir a la última respuesta" })).toBeVisible();
    await page.waitForTimeout(500);
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeLessThan(40);
    await frame.getByRole("button", { name: "Ir a la última respuesta" }).click();
    await expect
      .poll(() =>
        scroller.evaluate(
          (element) => element.scrollHeight - element.scrollTop - element.clientHeight,
        ),
      )
      .toBeLessThan(80);
  });

  test("restores history after a reload without duplicate session requests", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "¿Qué incluye?");
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    let sessionRequests = 0;
    page.on("request", (request) => {
      if (request.url().endsWith("/api/v1/session")) sessionRequests++;
    });
    await page.reload();
    await page.getByRole("button", { name: "Asistente", exact: true }).click();
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    await frame.getByRole("button", { name: "Minimizar asistente" }).click();
    await page.getByRole("button", { name: "Asistente", exact: true }).click();
    expect(sessionRequests).toBe(1);
  });
});

test.describe("preferences, themes and protocol abuse", () => {
  test("applies the host theme and page context; dark theme passes the automated scan", async ({
    page,
  }, testInfo) => {
    const frame = await openPanel(page);
    const inner = await assistantFrame(page);
    await page.locator("#theme").selectOption("dark");
    await expect
      .poll(() => inner.evaluate(() => document.documentElement.dataset.theme))
      .toBe("dark");
    await ask(frame, "¿Qué incluye?");
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    await capture(page, testInfo, "embed-dark");
    await expectNoAxeViolations(page);
  });

  test("ignores invalid messages and a hostile sibling frame", async ({ page }) => {
    await openPanel(page);
    const inner = await assistantFrame(page);
    await page.getByRole("button", { name: "Enviar mensajes inválidos" }).click();
    await page.getByRole("button", { name: "Inyectar marco hostil" }).click();
    await page.waitForTimeout(500);
    expect(await inner.evaluate(() => document.documentElement.dataset.theme)).toBe("light");
    await expect(page.locator("#panel")).toBeVisible();
  });

  test("renders untrusted links and markup safely", async ({ page }) => {
    const frame = await openPanel(page);
    await ask(frame, "muéstrame enlaces");
    await expect(frame.getByRole("article")).toHaveCount(1); // the foreign-URL product is dropped
    // Answer text is never linkified, not even for allowed URLs; actions come from links[].
    await expect(frame.getByText("[soporte](", { exact: false })).toBeVisible();
    await expect(frame.getByRole("link", { name: /^soporte/ })).toHaveCount(0);
    await expect(frame.getByRole("link", { name: "sitio externo" })).toHaveCount(0);
    await expect(frame.getByRole("link", { name: /Soporte y contacto/ })).toHaveAttribute(
      "href",
      `${HARNESS}/soporte/`,
    );
    await expect(frame.getByRole("link", { name: "Enlace no permitido" })).toHaveCount(0);
    await ask(frame, "respuesta larga");
    await expect(frame.getByText("<script>alert(1)</script>").first()).toBeVisible();
    const inner = await assistantFrame(page);
    expect(await inner.evaluate(() => document.querySelectorAll("main script").length)).toBe(0);
  });

  test("reduced motion and 200% zoom keep the panel usable without horizontal scrolling", async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 640, height: 400 }); // 1280×800 at 200 % zoom
    const frame = await openPanel(page);
    await ask(frame, "¿Qué incluye?");
    await expect(frame.getByRole("article", { name: "Grafismo Fonético" })).toBeVisible();
    const inner = await assistantFrame(page);
    expect(
      await inner.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const animated = await inner.evaluate(
      () =>
        document.getAnimations().filter((animation) => {
          const timing = animation.effect?.getComputedTiming();
          return timing && Number(timing.duration) > 1;
        }).length,
    );
    expect(animated).toBe(0);
    await capture(page, testInfo, "embed-zoom-reduced-motion");
  });
});
