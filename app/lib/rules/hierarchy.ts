import { describe, finding, type Rule } from "./types";

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

function headingLevels(ctx: { root: { querySelectorAll(s: string): { rawTagName: string; text: string }[] } }) {
  return ctx.root
    .querySelectorAll(HEADING_SELECTOR)
    .filter((h) => h.text.trim())
    .map((h) => ({ level: Number(h.rawTagName.slice(1)), text: h.text.trim() }));
}

export const headingOrderRule: Rule = {
  id: "hier-heading-order",
  effort: "medium",
  category: "hierarchy",
  maxPenalty: 12,
  severity: "medium",
  wcag: "1.3.1",
  evaluate(ctx) {
    const headings = headingLevels(ctx);
    if (headings.length < 2) return null;

    const skips: string[] = [];
    for (let i = 1; i < headings.length; i++) {
      const jump = headings[i].level - headings[i - 1].level;
      if (jump > 1) {
        skips.push(
          `H${headings[i - 1].level} "${headings[i - 1].text.slice(0, 34)}" → H${headings[i].level} "${headings[i].text.slice(0, 34)}"`
        );
      }
    }
    if (skips.length === 0) return null;

    return finding(this, {
      title: {
        en: `Heading levels skip ${skips.length} time${skips.length > 1 ? "s" : ""}`,
        es: `Los niveles de encabezado saltan ${skips.length} ${skips.length > 1 ? "veces" : "vez"}`,
      },
      description: {
        en: "Jumping from H2 straight to H4 breaks the document outline. Assistive tech uses heading levels to build a table of contents, and a gap reads as a missing section.",
        es: "Saltar de H2 directamente a H4 rompe el esquema del documento. La tecnología asistiva usa los niveles para construir un índice, y un hueco se interpreta como una sección que falta.",
      },
      fix: {
        en: "Use heading levels sequentially. If a level looks wrong visually, fix it with CSS instead of changing the tag.",
        es: "Usa los niveles de forma secuencial. Si un nivel no encaja visualmente, ajústalo con CSS en vez de cambiar la etiqueta.",
      },
      evidence: skips.slice(0, 4).map((s) => ({ detail: s })),
      ratio: Math.min(1, skips.length / 3),
    });
  },
};

export const headingDensityRule: Rule = {
  id: "hier-heading-density",
  effort: "high",
  category: "hierarchy",
  maxPenalty: 12,
  severity: "medium",
  evaluate(ctx) {
    const words = ctx.visibleText.split(/\s+/).filter(Boolean).length;
    // Con poco texto no hay nada que estructurar.
    if (words < 250) return null;

    const headings = headingLevels(ctx).length;
    const wordsPerHeading = headings === 0 ? words : words / headings;
    if (wordsPerHeading < 300) return null;

    return finding(this, {
      title: {
        en: "Long content with almost no headings",
        es: "Contenido extenso casi sin encabezados",
      },
      description: {
        en: "Users scan before they read. Large blocks of text with no headings force them to read linearly to find anything, which is the main reason people give up on a page.",
        es: "Los usuarios escanean antes de leer. Bloques largos de texto sin encabezados obligan a leer en línea recta para encontrar algo, que es el motivo principal por el que se abandona una página.",
      },
      fix: {
        en: "Break the content into sections of roughly 150-250 words, each introduced by a descriptive H2 or H3.",
        es: "Divide el contenido en secciones de unas 150-250 palabras, cada una encabezada por un H2 o H3 descriptivo.",
      },
      evidence: [
        { detail: `${words} palabras visibles y ${headings} encabezados` },
        { detail: `${Math.round(wordsPerHeading)} palabras por encabezado (recomendado: menos de 300)` },
      ],
      ratio: Math.min(1, (wordsPerHeading - 300) / 500 + 0.4),
    });
  },
};

export const landmarkRule: Rule = {
  id: "hier-landmarks",
  effort: "low",
  category: "hierarchy",
  maxPenalty: 12,
  severity: "medium",
  wcag: "1.3.1",
  evaluate(ctx) {
    const present: string[] = [];
    const missing: string[] = [];
    const checks: [string, string][] = [
      ["header, [role=banner]", "header"],
      ["nav, [role=navigation]", "nav"],
      ["footer, [role=contentinfo]", "footer"],
    ];
    for (const [selector, name] of checks) {
      if (ctx.root.querySelectorAll(selector).length > 0) present.push(name);
      else missing.push(name);
    }
    if (missing.length === 0) return null;

    // Una página muy simple no necesita las tres regiones.
    const words = ctx.visibleText.split(/\s+/).filter(Boolean).length;
    if (words < 120 && missing.length < 3) return null;

    return finding(this, {
      title: {
        en: `Missing structural regions: ${missing.join(", ")}`,
        es: `Faltan regiones estructurales: ${missing.join(", ")}`,
      },
      description: {
        en: "The page is built from generic <div> containers instead of semantic regions. Assistive tech offers a shortcut menu of regions; without them the page is one undifferentiated block.",
        es: "La página se construye con contenedores <div> genéricos en lugar de regiones semánticas. La tecnología asistiva ofrece un menú de regiones; sin ellas la página es un único bloque indiferenciado.",
      },
      fix: {
        en: "Replace the outer wrapper divs with <header>, <nav>, and <footer> as appropriate. It is a tag change, not a redesign.",
        es: "Sustituye los div contenedores por <header>, <nav> y <footer> según corresponda. Es un cambio de etiqueta, no un rediseño.",
      },
      evidence: [
        { detail: `presentes: ${present.length ? present.join(", ") : "ninguna"}` },
        { detail: `ausentes: ${missing.join(", ")}`, count: missing.length },
      ],
      ratio: missing.length / 3,
    });
  },
};

export const inlineStyleRule: Rule = {
  id: "hier-inline-styles",
  effort: "high",
  category: "hierarchy",
  maxPenalty: 8,
  severity: "low",
  evaluate(ctx) {
    const styled = ctx.root.querySelectorAll("[style]");
    const total = ctx.root.querySelectorAll("*").length;
    if (total === 0 || styled.length < 25) return null;
    const ratio = styled.length / total;
    if (ratio < 0.15) return null;

    return finding(this, {
      title: {
        en: `${styled.length} elements carry inline styles`,
        es: `${styled.length} elementos llevan estilos en línea`,
      },
      description: {
        en: "Heavy inline styling usually means spacing and type scale are decided per element rather than by a system, which is what makes a layout feel inconsistent.",
        es: "El uso masivo de estilos en línea suele significar que el espaciado y la escala tipográfica se deciden elemento a elemento en vez de por sistema, que es lo que hace que un diseño se perciba inconsistente.",
      },
      fix: {
        en: "Move repeated inline declarations into CSS classes or design tokens so spacing and type scale come from one place.",
        es: "Lleva las declaraciones repetidas a clases CSS o tokens de diseño para que el espaciado y la tipografía salgan de un solo sitio.",
      },
      evidence: [
        { detail: `${styled.length} de ${total} elementos (${Math.round(ratio * 100)}%)`, count: styled.length },
        ...styled.slice(0, 2).map((el) => ({
          selector: describe(el),
          snippet: `style="${(el.getAttribute("style") ?? "").slice(0, 70)}"`,
        })),
      ],
      ratio: Math.min(1, ratio * 2),
    });
  },
};

export const hierarchyRules: Rule[] = [
  headingOrderRule,
  headingDensityRule,
  landmarkRule,
  inlineStyleRule,
];
