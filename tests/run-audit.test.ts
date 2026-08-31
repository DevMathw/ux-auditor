import { beforeEach, describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAudit, type AuditDeps } from "@/app/lib/runAudit";
import { resetUsage, getUsageReport } from "@/app/lib/usage";
import type { VisualSnapshot } from "@/app/lib/render";
import type { AuditChecks } from "@/app/lib/types";

/**
 * Tests del caso de uso completo. Las dependencias externas se inyectan, así
 * que se prueba el comportamiento real de la orquestación — degradación
 * incluida — sin red, sin navegador y sin llamadas al modelo.
 */

const CHECKS: AuditChecks = { accessibility: true, visualHierarchy: true, uxClarity: true };

let seq = 0;
/** HTML único por test para no compartir entradas de caché. */
function html(extra = "") {
  return `<!DOCTYPE html><html lang="en"><head><title>A reasonable page title ${++seq}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A description of a sensible length that sits comfortably inside the recommended range for search results.">
<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="i">
<link rel="icon" href="/favicon.ico"></head>
<body><header>h</header><nav><a href="/a">Pricing</a></nav><main><h1>Main heading</h1>
<p>${"readable sentence of real content ".repeat(20)}</p><button>Get started</button>${extra}</main>
<footer>f</footer></body></html>`;
}

function visualSnapshot(over: Partial<VisualSnapshot> = {}): VisualSnapshot {
  return {
    viewport: { width: 1280, height: 800 },
    aboveFoldText: "A clear headline that explains what this product does for you",
    textElements: [
      {
        selector: "p.copy",
        tag: "p",
        text: "A line of body copy long enough to count as running text here.",
        rect: { x: 0, y: 0, w: 600, h: 20 },
        fontSize: 16,
        fontWeight: 400,
        color: "rgb(20, 20, 20)",
        background: "rgb(255, 255, 255)",
        contrast: 15,
        contrastThreshold: 4.5,
        aboveFold: true,
      },
    ],
    touchTargets: [
      { selector: "button.cta", tag: "button", label: "Get started", rect: { x: 0, y: 0, w: 120, h: 44 } },
    ],
    mobileScrollWidth: 390,
    mobileViewportWidth: 390,
    screenshot: null,
    screenshotMediaType: "image/jpeg",
    ...over,
  };
}

function aiMessage(payload: unknown, usage = { input: 1000, output: 500 }): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5",
    content: [{ type: "text", text: JSON.stringify(payload), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: usage.input, output_tokens: usage.output },
  } as unknown as Anthropic.Message;
}

const VALID_INSIGHTS = {
  summary: "A summary of the page.",
  strengths: "Clear headline.",
  quickWins: "Fix the contrast first.",
  insights: [
    {
      title: "Headline is vague",
      description: "It states a category rather than a benefit.",
      fix: "Name the outcome the visitor gets.",
      quote: "Main heading",
      category: "clarity",
      severity: "medium",
      effort: "low",
    },
  ],
};

function deps(over: Partial<AuditDeps> = {}): AuditDeps {
  return {
    fetchPage: vi.fn(async () => ({
      ok: true as const,
      html: html(),
      finalUrl: "https://example.test/",
    })),
    render: vi.fn(async () => null),
    renderAvailable: vi.fn(async () => false),
    createMessage: vi.fn(async () => aiMessage(VALID_INSIGHTS)),
    hasApiKey: () => true,
    ...over,
  };
}

const URL_ = new URL("https://example.test/");

beforeEach(() => {
  resetUsage();
});

describe("camino feliz", () => {
  it("devuelve un informe completo", async () => {
    const result = await runAudit({ url: URL_, checks: CHECKS, language: "en" }, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit.version).toBe(2);
    expect(result.audit.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.audit.checksApplicable).toBeGreaterThan(0);
    expect(result.cached).toBe(false);
  });

  it("respeta las áreas solicitadas", async () => {
    const result = await runAudit(
      { url: URL_, checks: { accessibility: true, visualHierarchy: false, uxClarity: false }, language: "en" },
      deps()
    );
    if (!result.ok) throw new Error("esperaba ok");
    expect(result.audit.scoreBreakdown.accessibility).not.toBeNull();
    expect(result.audit.scoreBreakdown.visualHierarchy).toBeNull();
  });
});

describe("fallos de descarga", () => {
  const cases: [string, "blocked" | "unreachable" | "not_html" | "too_large"][] = [
    ["SSRF bloqueado", "blocked"],
    ["host inalcanzable", "unreachable"],
    ["respuesta no HTML", "not_html"],
    ["página demasiado grande", "too_large"],
  ];

  it.each(cases)("propaga %s", async (_name, reason) => {
    const result = await runAudit(
      { url: URL_, checks: CHECKS, language: "en" },
      deps({ fetchPage: async () => ({ ok: false as const, reason }) })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(`fetch_${reason}`);
  });

  it("no llama al modelo si no pudo descargar la página", async () => {
    const createMessage = vi.fn();
    await runAudit(
      { url: URL_, checks: CHECKS, language: "en" },
      deps({ fetchPage: async () => ({ ok: false as const, reason: "blocked" as const }), createMessage })
    );
    expect(createMessage).not.toHaveBeenCalled();
  });
});

describe("capa de IA", () => {
  it("añade los hallazgos de IA a los de reglas", async () => {
    const result = await runAudit({ url: URL_, checks: CHECKS, language: "en" }, deps());
    if (!result.ok) throw new Error("esperaba ok");
    expect(result.audit.aiEnabled).toBe(true);
    expect(result.audit.findings.some((f) => f.source === "ai")).toBe(true);
    expect(result.audit.summary).toBe("A summary of the page.");
  });

  it("descarta observaciones de IA sin cita", async () => {
    const noQuote = {
      ...VALID_INSIGHTS,
      insights: [{ ...VALID_INSIGHTS.insights[0], quote: "" }],
    };
    const result = await runAudit(
      { url: URL_, checks: CHECKS, language: "en" },
      deps({ createMessage: vi.fn(async () => aiMessage(noQuote)) })
    );
    if (!result.ok) throw new Error("esperaba ok");
    // Sin evidencia no entra al informe, aunque el modelo la haya devuelto.
    expect(result.audit.findings.some((f) => f.source === "ai")).toBe(false);
  });

  it("degrada a informe determinista si el modelo falla", async () => {
    const result = await runAudit(
      { url: URL_, checks: CHECKS, language: "en" },
      deps({ createMessage: vi.fn(async () => { throw new Error("503 upstream"); }) })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit.aiEnabled).toBe(false);
    // Y sigue entregando un informe utilizable, no un error.
    expect(result.audit.summary).toContain("applicable automated checks");
    expect(result.audit.checksApplicable).toBeGreaterThan(0);
  });

  it("degrada si el modelo devuelve JSON inválido", async () => {
    const broken = { ...aiMessage({}), content: [{ type: "text", text: "{no es json" }] } as unknown as Anthropic.Message;
    const result = await runAudit(
      { url: URL_, checks: CHECKS, language: "en" },
      deps({ createMessage: vi.fn(async () => broken) })
    );
    if (!result.ok) throw new Error("esperaba ok");
    expect(result.audit.aiEnabled).toBe(false);
  });

  it("no llama al modelo cuando ai:false", async () => {
    const createMessage = vi.fn();
    const result = await runAudit(
      { url: URL_, checks: CHECKS, language: "en", ai: false },
      deps({ createMessage })
    );
    expect(createMessage).not.toHaveBeenCalled();
    if (!result.ok) throw new Error("esperaba ok");
    expect(result.audit.aiEnabled).toBe(false);
  });

  it("no llama al modelo sin clave de API", async () => {
    const createMessage = vi.fn();
    await runAudit(
      { url: URL_, checks: CHECKS, language: "en" },
      deps({ createMessage, hasApiKey: () => false })
    );
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("la IA NUNCA altera la puntuación", async () => {
    const page = html();
    const fixed = vi.fn(async () => ({ ok: true as const, html: page, finalUrl: "https://score.test/" }));
    const withAI = await runAudit({ url: URL_, checks: CHECKS, language: "en" }, deps({ fetchPage: fixed }));
    const withoutAI = await runAudit(
      { url: URL_, checks: CHECKS, language: "en", ai: false },
      deps({ fetchPage: fixed })
    );
    if (!withAI.ok || !withoutAI.ok) throw new Error("esperaba ok");
    expect(withAI.audit.overallScore).toBe(withoutAI.audit.overallScore);
    expect(withAI.audit.checksPassed).toBe(withoutAI.audit.checksPassed);
  });
});

describe("capa de renderizado", () => {
  it("activa las reglas visuales cuando hay navegador", async () => {
    const withRender = await runAudit(
      { url: URL_, checks: CHECKS, language: "en", ai: false },
      deps({ renderAvailable: vi.fn(async () => true), render: vi.fn(async () => visualSnapshot()) })
    );
    if (!withRender.ok) throw new Error("esperaba ok");
    expect(withRender.audit.rendered).toBe(true);
    expect(withRender.audit.checksApplicable).toBeGreaterThan(20);
  });

  it("degrada si el renderizado falla", async () => {
    const result = await runAudit(
      { url: URL_, checks: CHECKS, language: "en", ai: false },
      deps({ renderAvailable: vi.fn(async () => true), render: vi.fn(async () => null) })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.audit.rendered).toBe(false);
    // El informe determinista de marcado sigue completo.
    expect(result.audit.findings.length).toBeGreaterThanOrEqual(0);
    expect(result.audit.checksApplicable).toBeGreaterThan(0);
  });

  it("no renderiza cuando visual:false", async () => {
    const render = vi.fn(async () => visualSnapshot());
    await runAudit(
      { url: URL_, checks: CHECKS, language: "en", ai: false, visual: false },
      deps({ renderAvailable: vi.fn(async () => true), render })
    );
    expect(render).not.toHaveBeenCalled();
  });

  it("envía la captura al modelo cuando existe", async () => {
    const createMessage: AuditDeps["createMessage"] = vi.fn(async () => aiMessage(VALID_INSIGHTS));
    const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
    const capturing: AuditDeps["createMessage"] = async (params, options) => {
      calls.push(params);
      return createMessage(params, options);
    };
    await runAudit(
      { url: URL_, checks: CHECKS, language: "en" },
      deps({
        renderAvailable: vi.fn(async () => true),
        render: vi.fn(async () => visualSnapshot({ screenshot: "AAAA" })),
        createMessage: capturing,
      })
    );
    const content = calls[0].messages[0].content as Anthropic.ContentBlockParam[];
    expect(content.some((b) => b.type === "image")).toBe(true);
  });
});

describe("caché", () => {
  it("la segunda auditoría del mismo contenido viene de caché", async () => {
    const page = html();
    const fetchPage = vi.fn(async () => ({ ok: true as const, html: page, finalUrl: "https://cached.test/" }));
    const createMessage = vi.fn(async () => aiMessage(VALID_INSIGHTS));

    const first = await runAudit({ url: URL_, checks: CHECKS, language: "en" }, deps({ fetchPage, createMessage }));
    const second = await runAudit({ url: URL_, checks: CHECKS, language: "en" }, deps({ fetchPage, createMessage }));

    if (!first.ok || !second.ok) throw new Error("esperaba ok");
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    // Lo que importa del caché: no se vuelve a pagar la llamada al modelo.
    expect(createMessage).toHaveBeenCalledTimes(1);
  });

  it("un contenido distinto no reutiliza la entrada", async () => {
    const a = await runAudit({ url: URL_, checks: CHECKS, language: "en", ai: false }, deps());
    const b = await runAudit({ url: URL_, checks: CHECKS, language: "en", ai: false }, deps());
    if (!a.ok || !b.ok) throw new Error("esperaba ok");
    expect(b.cached).toBe(false);
  });
});

describe("contabilidad de coste", () => {
  it("registra tokens y coste de una auditoría con IA", async () => {
    await runAudit({ url: URL_, checks: CHECKS, language: "en" }, deps());
    const report = getUsageReport();
    expect(report.audits).toBe(1);
    expect(report.aiCalls).toBe(1);
    expect(report.inputTokens).toBe(1000);
    expect(report.outputTokens).toBe(500);
    // 1000/1e6*2 + 500/1e6*10 = 0.002 + 0.005
    expect(report.totalCostUsd).toBeCloseTo(0.007, 5);
  });

  it("una auditoría sin IA cuenta como gratuita", async () => {
    await runAudit({ url: URL_, checks: CHECKS, language: "en", ai: false }, deps());
    const report = getUsageReport();
    expect(report.audits).toBe(1);
    expect(report.aiCalls).toBe(0);
    expect(report.freeAudits).toBe(1);
    expect(report.totalCostUsd).toBe(0);
  });
});
