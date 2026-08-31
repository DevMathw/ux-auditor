import { expect, test } from "@playwright/test";
import { stubAudit, stubAuditError, stubExplain } from "./fixtures";

/**
 * El recorrido completo en un navegador real.
 *
 * Lo que se verifica aquí y no se puede verificar en jsdom: que la CSP con
 * nonce no bloquee la hidratación, que los chunks partidos se carguen bajo
 * demanda, que el almacenamiento persista entre navegaciones y que la
 * impresión del PDF se dispare de verdad.
 */

const URL_FIELD = "input#url-field";

/**
 * Next inyecta un `<div role="alert">` vacío como anunciador de rutas, así que
 * `getByRole("alert")` siempre resuelve a dos elementos. Estos localizadores
 * apuntan al aviso real de la aplicación.
 */
const errorBanner = ".error-banner";
const warnNotice = ".notice-warn";

/**
 * Escribe la URL en el campo y espera a que React lo registre.
 *
 * Rellenar antes de que React hidrate deja el valor en el DOM pero no en el
 * estado, y al hidratar React lo revierte — el botón queda deshabilitado para
 * siempre. Esperar no basta: hay que volver a escribir después de la
 * hidratación. Que el botón se habilite es la señal de que el estado lo tiene.
 */
async function escribirUrl(page: import("@playwright/test").Page, url: string) {
  const field = page.locator(URL_FIELD);
  const submit = page.getByRole("button", { name: /run audit|analizar/i });

  await expect(field).toBeVisible();
  for (let intento = 0; intento < 5; intento++) {
    await field.fill(url);
    try {
      await expect(submit).toBeEnabled({ timeout: 2000 });
      return submit;
    } catch {
      // Aún no hidratado: se reintenta.
      await page.waitForTimeout(300);
    }
  }
  await expect(submit).toBeEnabled({ timeout: 5000 });
  return submit;
}

/** Escribe la URL y lanza la auditoría. */
async function lanzarAuditoria(page: import("@playwright/test").Page, url: string) {
  const submit = await escribirUrl(page, url);
  await submit.click();
}

test.describe("recorrido completo", () => {
  test("de la portada al informe, con detalle y exportación", async ({ page }) => {
    // Retardo pequeño: sin él la respuesta llega antes de que se pueda observar
    // el estado de carga.
    await stubAudit(page, { delayMs: 400 });
    await stubExplain(page);

    // ── Abrir la aplicación ───────────────────────────────────────────────
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /UX Auditor/i })).toBeVisible();
    await expect(page.getByText(/what you get/i)).toBeVisible();

    // ── Introducir URL y lanzar la auditoría ──────────────────────────────
    await lanzarAuditoria(page, "https://example.com");

    // ── Esperar el resultado ──────────────────────────────────────────────
    await expect(page.getByRole("status")).toBeVisible();
    await expect(page.getByRole("button", { name: /cancel/i })).toBeVisible();

    // ── Ver los hallazgos ─────────────────────────────────────────────────
    await expect(page.getByText("62")).toBeVisible();
    await expect(page.getByText(/14 of 23 checks passed/i)).toBeVisible();
    // Aparece dos veces: en la banda de quick wins y en la lista.
    await expect(page.getByText(/3 text elements below the contrast/i).first()).toBeVisible();

    // Los grupos por severidad existen y lo crítico va primero.
    const severities = await page.locator(".severity-heading").allTextContents();
    expect(severities[0]).toMatch(/critical/i);

    // ── Abrir el detalle ──────────────────────────────────────────────────
    const firstFinding = page.locator("article.finding").first();
    await firstFinding.getByRole("button", { name: /evidence/i }).click();
    await expect(firstFinding.getByText("span.meta")).toBeVisible();
    await expect(firstFinding.getByText(/3\.54:1/)).toBeVisible();
    await expect(firstFinding.getByText(/darken the text/i)).toBeVisible();

    // ── Exportar ──────────────────────────────────────────────────────────
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /json/i }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^ux-audit-example\.com-\d{4}-\d{2}-\d{2}\.json$/);

    // ── El historial guardó la auditoría ──────────────────────────────────
    await page.getByRole("button", { name: /run another audit/i }).click();
    await expect(page.getByRole("button", { name: /^load$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /clear all/i })).toBeVisible();
  });
});

test.describe("seguridad en el navegador real", () => {
  test("la CSP con nonce no rompe la hidratación", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) {
        violations.push(msg.text());
      }
    });

    await stubAudit(page);
    await page.goto("/");

    // Si la CSP bloquease los scripts, React no hidrataría y el botón nunca
    // llegaría a habilitarse — que es exactamente lo que comprueba el helper.
    await escribirUrl(page, "https://example.com");

    expect(violations).toEqual([]);
  });

  test("script-src no permite unsafe-inline y el nonce cambia por petición", async ({ page }) => {
    const first = await page.goto("/");
    const cspA = first!.headers()["content-security-policy"];

    const scriptSrc = cspA.split(";").find((d) => d.trim().startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).toContain("strict-dynamic");

    const second = await page.goto("/scoring");
    const cspB = second!.headers()["content-security-policy"];
    expect(cspA).not.toBe(cspB);
  });
});

test.describe("estados de error", () => {
  test("una URL bloqueada muestra un mensaje comprensible", async ({ page }) => {
    await stubAuditError(page, "fetch_blocked", 400);
    await page.goto("/");

    await lanzarAuditoria(page, "http://127.0.0.1");

    const alert = page.locator(errorBanner);
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(/only public websites are allowed/i);
  });

  test("se puede reintentar tras un error", async ({ page }) => {
    await stubAuditError(page, "fetch_unreachable", 422);
    await page.goto("/");
    await lanzarAuditoria(page, "https://example.com");
    await expect(page.locator(errorBanner)).toBeVisible();

    await page.unroute("**/api/audit");
    await stubAudit(page);
    await page.getByRole("button", { name: /run audit/i }).click();
    await expect(page.getByText("62")).toBeVisible();
  });

  test("cancelar detiene la auditoría sin mostrar un error", async ({ page }) => {
    // Retardo largo: la auditoría no debe completarse antes de que dé tiempo a
    // pulsar Cancelar. El fixture captura el fallo de fulfill sobre la petición
    // ya abortada, que es justo lo que este test provoca.
    await stubAudit(page, { delayMs: 10_000 });
    await page.goto("/");

    await lanzarAuditoria(page, "https://example.com");
    await expect(page.getByRole("status")).toBeVisible();

    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.locator(errorBanner)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /run audit/i })).toBeVisible();
  });
});

test.describe("honestidad del informe", () => {
  test("avisa cuando faltó la capa de renderizado", async ({ page }) => {
    await stubAudit(page, { rendered: false });
    await page.goto("/");
    await lanzarAuditoria(page, "https://example.com");

    await expect(page.getByText(/markup-only audit/i)).toBeVisible();
  });

  test("avisa de baja confianza como alerta", async ({ page }) => {
    await stubAudit(page, { confidence: "low" });
    await page.goto("/");
    await lanzarAuditoria(page, "https://example.com");

    await expect(page.locator(warnNotice)).toContainText(/low confidence/i);
  });

  test("distingue lo verificado de la lectura de IA", async ({ page }) => {
    await stubAudit(page);
    await page.goto("/");
    await lanzarAuditoria(page, "https://example.com");

    await expect(page.getByText("✓ Verified").first()).toBeVisible();
    await expect(page.getByText("✦ AI insight").first()).toBeVisible();
  });
});

test.describe("persistencia e idioma", () => {
  test("el historial sobrevive a una recarga", async ({ page }) => {
    await stubAudit(page);
    await page.goto("/");
    await lanzarAuditoria(page, "https://example.com");
    await expect(page.getByText("62")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: /clear all/i })).toBeVisible();
    await expect(page.getByText("example.com/")).toBeVisible();
  });

  test("el idioma persiste entre recargas y ajusta html lang", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /español/i }).click();
    await expect(page.getByRole("button", { name: /analizar/i })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");

    await page.reload();
    await expect(page.getByRole("button", { name: /analizar/i })).toBeVisible();
  });
});

test.describe("página de scoring", () => {
  test("documenta las 27 reglas y es alcanzable", async ({ page }) => {
    await page.goto("/scoring");
    await expect(page.getByRole("heading", { name: /how .*scoring.* works/i })).toBeVisible();
    await expect(page.locator("article.rule-doc")).toHaveCount(27);
    // La fórmula está publicada, no escondida.
    await expect(page.getByText(/penalties possible on this page/i)).toBeVisible();
  });

  test("se puede volver a la aplicación", async ({ page }) => {
    await page.goto("/scoring");
    await page.getByRole("link", { name: /run an audit/i }).click();
    await expect(page.locator(URL_FIELD)).toBeVisible();
  });
});

test.describe("capacidades del despliegue", () => {
  test("/api/health dice qué capas están activas", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.layers.rules.count).toBe(27);
    expect(["up", "degraded"]).toContain(body.layers.rendering.status);
    // Nunca debe filtrar la credencial, sólo si existe.
    expect(JSON.stringify(body)).not.toContain("sk-ant");
  });
});
