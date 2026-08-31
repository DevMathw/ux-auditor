import { describe, expect, it } from "vitest";
import { runRules } from "@/app/lib/rules";
import type { AuditChecks } from "@/app/lib/types";

const ALL: AuditChecks = { accessibility: true, visualHierarchy: true, uxClarity: true };
const URL_ = new URL("https://example.test/");

function audit(html: string, checks: AuditChecks = ALL) {
  return runRules(html, URL_, checks);
}

/** Envuelve un fragmento en una página que por lo demás está bien formada. */
function page(body: string, head = "") {
  return `<!DOCTYPE html><html lang="en"><head><title>A reasonable page title</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A description of a sensible length that sits comfortably inside the recommended range for search results.">
<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="i">
<link rel="icon" href="/favicon.ico">${head}</head>
<body><header>h</header><nav><a href="/a">Pricing</a></nav><main><h1>Main heading</h1>${body}</main><footer>f</footer></body></html>`;
}

function ids(report: ReturnType<typeof runRules>) {
  return report.findings.map((f) => f.ruleId);
}

describe("determinismo", () => {
  it("produce un resultado idéntico para el mismo HTML", () => {
    const html = page("<p>Some content that is long enough to matter here.</p>");
    expect(JSON.stringify(audit(html))).toBe(JSON.stringify(audit(html)));
  });

  it("no depende del orden de las claves de checks", () => {
    const html = page("<p>Content</p>");
    const a = runRules(html, URL_, { uxClarity: true, accessibility: true, visualHierarchy: true });
    const b = runRules(html, URL_, { accessibility: true, visualHierarchy: true, uxClarity: true });
    expect(a.overallScore).toBe(b.overallScore);
  });
});

describe("puntuación", () => {
  it("da 100 a una página que supera todo lo aplicable", () => {
    // Una página "perfecta" necesita contenido real Y una acción: si falta
    // cualquiera de las dos, la regla correspondiente debe dispararse.
    const report = audit(
      page(`<p>${"readable sentence of real content ".repeat(20)}</p><button>Get started</button>`)
    );
    expect(report.findings).toHaveLength(0);
    expect(report.overallScore).toBe(100);
    expect(report.totalPassed).toBe(report.totalApplicable);
  });

  it("nunca sale del rango 0-100", () => {
    const awful = `<html><body><div>${"<img src=x>".repeat(40)}</div></body></html>`;
    const report = audit(awful);
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);
  });

  it("solo puntúa las categorías solicitadas", () => {
    const report = audit(page("<p>x</p>"), { accessibility: true, visualHierarchy: false, uxClarity: false });
    expect(report.scores.accessibility).not.toBeNull();
    expect(report.scores.hierarchy).toBeNull();
    expect(report.scores.clarity).toBeNull();
  });

  it("no acredita reglas que no aplican a la página", () => {
    // Sin imágenes, la regla de alt no debe contar como aprobada.
    const withoutImages = audit(page("<p>Text only, no images at all in this page.</p>"));
    const withImages = audit(page('<p>Text</p><img src="a.png" alt="a">'));
    expect(withImages.totalApplicable).toBeGreaterThan(withoutImages.totalApplicable);
  });
});

describe("reglas de accesibilidad", () => {
  it("detecta la falta de atributo lang", () => {
    const html = '<html><head><title>Title here ok</title></head><body><p>x</p></body></html>';
    expect(ids(audit(html))).toContain("a11y-html-lang");
  });

  it("acepta alt=\"\" como marcado correcto de imagen decorativa", () => {
    const decorative = audit(page('<img src="a.png" alt=""><p>Body copy goes here for context.</p>'));
    expect(ids(decorative)).not.toContain("a11y-image-alt");

    const missing = audit(page('<img src="a.png"><p>Body copy goes here for context.</p>'));
    expect(ids(missing)).toContain("a11y-image-alt");
  });

  it("ignora elementos aria-hidden al contar H1", () => {
    const html = page('<h1 aria-hidden="true">Decorative duplicate</h1><p>Content</p>');
    expect(ids(audit(html))).not.toContain("a11y-h1");
  });

  it("lee el nombre accesible desde un SVG con aria-label", () => {
    const labelled = page('<p>Body</p><a href="/x"><svg aria-label="Amazon"><path/></svg></a>');
    expect(ids(audit(labelled))).not.toContain("a11y-link-text");

    const unlabelled = page('<p>Body</p><a href="/x"><svg><path/></svg></a>');
    expect(ids(audit(unlabelled))).toContain("a11y-link-text");
  });

  it("acepta un campo etiquetado por label envolvente", () => {
    const wrapped = page("<form><label>Email <input type=\"email\"></label></form>");
    expect(ids(audit(wrapped))).not.toContain("a11y-form-labels");
  });

  it("acepta un campo etiquetado por label[for]", () => {
    const forAttr = page('<form><label for="e">Email</label><input id="e" type="email"></form>');
    expect(ids(audit(forAttr))).not.toContain("a11y-form-labels");
  });

  it("marca un campo sin ninguna etiqueta", () => {
    const bare = page('<form><input type="text" placeholder="Email"></form>');
    expect(ids(audit(bare))).toContain("a11y-form-labels");
  });

  it("no exige skip link en una página sin navegación repetida", () => {
    const simple = `<!DOCTYPE html><html lang="en"><head><title>Short simple page</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="${"d".repeat(90)}">
</head><body><main><h1>H</h1><p>One link only <a href="/a">here</a>.</p></main></body></html>`;
    expect(ids(audit(simple))).not.toContain("a11y-skip-link");
  });

  it("detecta zoom desactivado en el viewport", () => {
    const html = page("<p>Body</p>").replace(
      'content="width=device-width, initial-scale=1"',
      'content="width=device-width, user-scalable=no"'
    );
    expect(ids(audit(html))).toContain("a11y-viewport");
  });
});

describe("reglas de jerarquía", () => {
  it("detecta un salto de nivel de encabezado", () => {
    expect(ids(audit(page("<h3>Skipped past h2</h3><p>Body</p>")))).toContain("hier-heading-order");
  });

  it("no marca una secuencia correcta", () => {
    expect(ids(audit(page("<h2>Two</h2><h3>Three</h3><p>Body</p>")))).not.toContain("hier-heading-order");
  });

  it("detecta la ausencia de regiones estructurales", () => {
    const bare = `<!DOCTYPE html><html lang="en"><head><title>Page with no landmarks</title>
<meta name="viewport" content="width=device-width"><meta name="description" content="${"d".repeat(90)}">
</head><body><div><h1>H</h1><p>${"word ".repeat(140)}</p></div></body></html>`;
    expect(ids(audit(bare))).toContain("hier-landmarks");
  });
});

describe("reglas de claridad", () => {
  it("detecta la falta de meta description", () => {
    const html = page("<p>Body</p>").replace(/<meta name="description"[^>]*>/, "");
    expect(ids(audit(html))).toContain("clarity-meta-description");
  });

  it("detecta un título demasiado corto", () => {
    const html = page("<p>Body</p>").replace("<title>A reasonable page title</title>", "<title>Hi</title>");
    expect(ids(audit(html))).toContain("clarity-title-quality");
  });

  it("detecta contenido demasiado escaso", () => {
    expect(ids(audit(page("<p>Hi</p>")))).toContain("clarity-content-depth");
  });
});

describe("confianza", () => {
  it("marca confianza baja cuando apenas hay texto legible", () => {
    const shell = '<!DOCTYPE html><html lang="en"><head><title>App shell here</title></head><body><div id="root"></div></body></html>';
    const report = audit(shell);
    expect(report.confidence).toBe("low");
    expect(report.confidenceReason).toBe("thin_content");
  });

  it("mantiene confianza alta con contenido suficiente", () => {
    const report = audit(page(`<p>${"word ".repeat(120)}</p><h2>Section</h2><p>${"more ".repeat(60)}</p>`));
    expect(report.confidence).toBe("high");
  });
});

describe("robustez", () => {
  it("no revienta con HTML vacío", () => {
    expect(() => audit("")).not.toThrow();
  });

  it("no revienta con HTML malformado", () => {
    expect(() => audit("<html><body><div><p>unclosed")).not.toThrow();
  });

  it("no revienta cuando no se pide ninguna categoría", () => {
    const report = runRules(page("<p>x</p>"), URL_, {
      accessibility: false,
      visualHierarchy: false,
      uxClarity: false,
    });
    expect(report.overallScore).toBe(0);
    expect(report.totalApplicable).toBe(0);
  });
});

describe("documentación de reglas", () => {
  it("toda regla registrada está documentada", async () => {
    const { ALL_RULES } = await import("@/app/lib/rules");
    const { RULE_DOCS } = await import("@/app/lib/rules/docs");
    const undocumented = ALL_RULES.filter((r) => !RULE_DOCS[r.id]).map((r) => r.id);
    // Si esto falla, alguien añadió una regla y olvidó documentarla: la página
    // pública "How scoring works" habría quedado desincronizada del código.
    expect(undocumented).toEqual([]);
  });

  it("no hay documentación huérfana", async () => {
    const { ALL_RULES } = await import("@/app/lib/rules");
    const { RULE_DOCS } = await import("@/app/lib/rules/docs");
    const ids = new Set(ALL_RULES.map((r) => r.id));
    expect(Object.keys(RULE_DOCS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("cada regla tiene identificador único", async () => {
    const { ALL_RULES } = await import("@/app/lib/rules");
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("los metadatos de cada regla son coherentes", async () => {
    const { ALL_RULES } = await import("@/app/lib/rules");
    for (const rule of ALL_RULES) {
      expect(rule.maxPenalty).toBeGreaterThan(0);
      expect(["critical", "high", "medium", "low"]).toContain(rule.severity);
      expect(["low", "medium", "high"]).toContain(rule.effort);
      expect(["accessibility", "hierarchy", "clarity"]).toContain(rule.category);
    }
  });
});
