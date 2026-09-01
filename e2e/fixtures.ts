import type { Page } from "@playwright/test";

/**
 * Respuestas de auditoría fijas para los E2E.
 *
 * La forma coincide con la que devuelve `runAudit()`; los tests de dominio
 * verifican que el servidor produzca exactamente esto, así que aquí se puede
 * asumir y centrarse en lo que sólo un navegador real puede comprobar.
 */

export interface AuditFixtureOptions {
  score?: number;
  rendered?: boolean;
  aiEnabled?: boolean;
  confidence?: "high" | "low";
  cached?: boolean;
  /** Retraso antes de responder, para poder observar el estado de carga. */
  delayMs?: number;
  /** null simula un despliegue sin almacenamiento: no se puede compartir. */
  auditId?: string | null;
}

/** Id fijo, para poder construir la ruta de compartir en los tests. */
export const FIXTURE_AUDIT_ID = "dd245044-5e3a-4b49-b1c0-05c2e5975b6f";
export const FIXTURE_SHARE_ID = "96c49e548e38498ba41e76";

export function auditFixture(options: AuditFixtureOptions = {}) {
  const {
    score = 62,
    rendered = true,
    aiEnabled = true,
    confidence = "high",
  } = options;

  return {
    audit: {
      version: 2,
      overallScore: score,
      scoreBreakdown: {
        accessibility: { score: 58, rulesApplicable: 12, rulesPassed: 7 },
        visualHierarchy: { score: 70, rulesApplicable: 5, rulesPassed: 3 },
        uxClarity: { score: 60, rulesApplicable: 6, rulesPassed: 4 },
      },
      checksPassed: 14,
      checksApplicable: 23,
      confidence,
      confidenceReason: confidence === "low" ? "thin_content" : null,
      rendered,
      findings: [
        {
          id: "visual-contrast",
          category: "accessibility",
          severity: "critical",
          impact: "high",
          effort: "low",
          title: "3 text elements below the contrast minimum",
          description:
            "Measured from the rendered page against the composited background.",
          fix: "Darken the text or lighten its background until the ratio clears the threshold.",
          evidence: [
            { detail: "3 of 41 measurable elements", count: 3 },
            {
              selector: "span.meta",
              detail: "3.54:1 (minimum 4.5:1) · rgb(130, 130, 130) on rgb(246, 246, 239)",
              snippet: "posted 3 hours ago",
            },
          ],
          wcag: "1.4.3",
          source: "rule",
        },
        {
          id: "a11y-main-landmark",
          category: "accessibility",
          severity: "high",
          impact: "high",
          effort: "low",
          title: "No main landmark",
          description: 'There is no <main> or role="main".',
          fix: "Wrap the primary content of the page in a single <main> element.",
          evidence: [{ selector: "main, [role=main]", detail: "0 found" }],
          wcag: "1.3.1",
          source: "rule",
        },
        {
          id: "clarity-meta-description",
          category: "clarity",
          severity: "medium",
          impact: "medium",
          effort: "low",
          title: "No meta description",
          description: "Search engines fall back to scraping whatever text they find first.",
          fix: "Add a 120-160 character description.",
          evidence: [{ selector: 'meta[name="description"]', detail: "absent" }],
          source: "rule",
        },
        ...(aiEnabled
          ? [
              {
                id: "ai-insight-1",
                category: "clarity",
                severity: "medium",
                impact: "medium",
                effort: "medium",
                title: "The headline states a category, not a benefit",
                description:
                  "A visitor learns what kind of thing this is, but not what it does for them.",
                fix: "Rewrite the headline around the outcome the visitor gets.",
                evidence: [
                  { detail: "Quoted from the page", snippet: "A platform for teams" },
                ],
                source: "ai",
              },
            ]
          : []),
      ],
      summary: aiEnabled
        ? "The page presents its offering clearly enough, but low contrast on secondary text undermines it."
        : `This page passes 14 of 23 applicable automated checks. There are 0 critical and 1 high-priority issue to address first.`,
      quickWins: aiEnabled ? "Fix the contrast first — it is a token change." : "",
      strengths: aiEnabled ? "The primary action is visually dominant." : "",
      aiEnabled,
    },
    analyzedUrl: "https://example.com/",
    cached: options.cached ?? false,
    auditId: options.auditId === undefined ? FIXTURE_AUDIT_ID : options.auditId,
  };
}

/** Intercepta el endpoint de compartir. Devuelve los métodos recibidos. */
export async function stubShare(page: Page) {
  const methods: string[] = [];
  await page.route(`**/api/audits/${FIXTURE_AUDIT_ID}/share`, async (route) => {
    const method = route.request().method();
    methods.push(method);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        method === "DELETE"
          ? { shared: false }
          : { shareId: FIXTURE_SHARE_ID, path: `/a/${FIXTURE_SHARE_ID}` }
      ),
    });
  });
  return methods;
}

/** Intercepta /api/audit y responde con el fixture. Devuelve las URLs pedidas. */
export async function stubAudit(page: Page, options: AuditFixtureOptions = {}) {
  const requested: string[] = [];

  await page.route("**/api/audit", async (route) => {
    const body = route.request().postDataJSON() as { url?: string };
    requested.push(body?.url ?? "");
    if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
    try {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(auditFixture(options)),
      });
    } catch {
      // La página puede haber abortado la petición mientras dormíamos — es
      // justo lo que prueba el test de cancelación. Cumplir una ruta muerta
      // lanza, y sin este catch la excepción cuelga a Playwright entero.
    }
  });

  return requested;
}

/** Intercepta /api/audit y responde con un error del servidor. */
export async function stubAuditError(page: Page, error: string, status = 400) {
  await page.route("**/api/audit", (route) =>
    route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify({ error }),
    })
  );
}

/** Intercepta /api/explain, que se llama al abrir el modal. */
export async function stubExplain(page: Page, explanation = "Because screen readers…") {
  await page.route("**/api/explain", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ explanation }),
    })
  );
}
