import { describe, expect, it } from "vitest";
import { runRules } from "@/app/lib/rules";
import type { TargetElement, TextElement, VisualSnapshot } from "@/app/lib/render";
import type { AuditChecks } from "@/app/lib/types";

const ALL: AuditChecks = { accessibility: true, visualHierarchy: true, uxClarity: true };
const URL_ = new URL("https://example.test/");

/** Página bien formada, para que solo varíe lo visual entre casos. */
const HTML = `<!DOCTYPE html><html lang="en"><head><title>A reasonable page title</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="A description of a sensible length that sits comfortably inside the recommended range for search results.">
<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="i">
<link rel="icon" href="/favicon.ico"></head>
<body><header>h</header><nav><a href="/a">Pricing</a></nav><main><h1>Main heading</h1>
<p>${"readable sentence of real content ".repeat(20)}</p><button>Get started</button></main><footer>f</footer></body></html>`;

function text(over: Partial<TextElement> = {}): TextElement {
  return {
    selector: "p.copy",
    tag: "p",
    text: "A line of body copy long enough to count as running text on the page.",
    rect: { x: 0, y: 0, w: 600, h: 20 },
    fontSize: 16,
    fontWeight: 400,
    color: "rgb(20, 20, 20)",
    background: "rgb(255, 255, 255)",
    contrast: 15,
    contrastThreshold: 4.5,
    aboveFold: true,
    ...over,
  };
}

function target(over: Partial<TargetElement> = {}): TargetElement {
  return {
    selector: "button.cta",
    tag: "button",
    label: "Get started",
    rect: { x: 0, y: 0, w: 120, h: 44 },
    ...over,
  };
}

function snapshot(over: Partial<VisualSnapshot> = {}): VisualSnapshot {
  return {
    viewport: { width: 1280, height: 800 },
    aboveFoldText: "A clear headline that explains what this product does for you right now",
    textElements: [text()],
    touchTargets: [target()],
    mobileScrollWidth: 390,
    mobileViewportWidth: 390,
    screenshot: null,
    screenshotMediaType: "image/jpeg",
    ...over,
  };
}

function ids(visual?: VisualSnapshot) {
  return runRules(HTML, URL_, ALL, visual).findings.map((f) => f.ruleId);
}

describe("activación de la capa visual", () => {
  it("no evalúa reglas visuales sin renderizado", () => {
    const report = runRules(HTML, URL_, ALL);
    expect(report.findings.some((f) => f.ruleId.startsWith("visual-"))).toBe(false);
  });

  it("amplía el número de reglas aplicables al renderizar", () => {
    const without = runRules(HTML, URL_, ALL).totalApplicable;
    const with_ = runRules(HTML, URL_, ALL, snapshot()).totalApplicable;
    expect(with_).toBeGreaterThan(without);
  });

  it("una página impecable sigue en 100 con las reglas visuales activas", () => {
    const report = runRules(HTML, URL_, ALL, snapshot());
    expect(report.findings).toHaveLength(0);
    expect(report.overallScore).toBe(100);
  });

  it("el renderizado eleva la confianza en una página con poco HTML servido", () => {
    const shell = '<!DOCTYPE html><html lang="en"><head><title>App shell here</title></head><body><div id="root"></div></body></html>';
    expect(runRules(shell, URL_, ALL).confidence).toBe("low");
    expect(runRules(shell, URL_, ALL, snapshot()).confidence).toBe("high");
  });
});

describe("contraste", () => {
  it("marca texto por debajo de 4.5:1", () => {
    expect(ids(snapshot({ textElements: [text({ contrast: 3.1 })] }))).toContain("visual-contrast");
  });

  it("acepta texto grande a 3:1", () => {
    const large = text({ contrast: 3.4, contrastThreshold: 3, fontSize: 32 });
    expect(ids(snapshot({ textElements: [large] }))).not.toContain("visual-contrast");
  });

  it("ignora elementos cuyo fondo no es determinable", () => {
    const indeterminate = text({ contrast: null, background: "indeterminado" });
    expect(ids(snapshot({ textElements: [indeterminate] }))).not.toContain("visual-contrast");
  });

  it("aporta el ratio medido y los colores como evidencia", () => {
    const report = runRules(HTML, URL_, ALL, snapshot({ textElements: [text({ contrast: 2.2 })] }));
    const finding = report.findings.find((f) => f.ruleId === "visual-contrast")!;
    const detail = finding.evidence.map((e) => e.detail ?? "").join(" ");
    expect(detail).toContain("2.2:1");
    expect(detail).toContain("rgb(20, 20, 20)");
  });
});

describe("tamaño de tipografía", () => {
  it("marca texto corrido por debajo de 12px", () => {
    expect(ids(snapshot({ textElements: [text({ fontSize: 10 })] }))).toContain("visual-font-size");
  });

  it("no marca fragmentos cortos como un pie de foto", () => {
    const caption = text({ fontSize: 10, text: "Fig. 1" });
    expect(ids(snapshot({ textElements: [caption] }))).not.toContain("visual-font-size");
  });
});

describe("zonas táctiles", () => {
  it("marca controles por debajo de 24px", () => {
    const small = target({ rect: { x: 0, y: 0, w: 18, h: 10 } });
    expect(ids(snapshot({ touchTargets: [small] }))).toContain("visual-touch-targets");
  });

  it("acepta un control de 44px", () => {
    expect(ids(snapshot())).not.toContain("visual-touch-targets");
  });
});

describe("desbordamiento horizontal", () => {
  it("marca contenido más ancho que el viewport móvil", () => {
    expect(ids(snapshot({ mobileScrollWidth: 472 }))).toContain("visual-horizontal-scroll");
  });

  it("tolera un par de píxeles de redondeo", () => {
    expect(ids(snapshot({ mobileScrollWidth: 393 }))).not.toContain("visual-horizontal-scroll");
  });
});

describe("primera pantalla", () => {
  it("marca una primera pantalla sin texto ni acción", () => {
    const empty = snapshot({
      aboveFoldText: "Hi",
      textElements: [text({ aboveFold: true, text: "Hi" })],
      touchTargets: [target({ rect: { x: 0, y: 2000, w: 120, h: 44 } })],
    });
    expect(ids(empty)).toContain("visual-above-fold");
  });

  it("acepta una primera pantalla con mensaje y acción", () => {
    expect(ids(snapshot())).not.toContain("visual-above-fold");
  });
});
