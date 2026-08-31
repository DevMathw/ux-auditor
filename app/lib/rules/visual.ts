import { finding, type Rule } from "./types";

/**
 * Reglas que solo existen cuando se ha renderizado la página. Todas declaran
 * `applies` contra `ctx.visual`, así que en una auditoría sin navegador
 * sencillamente no cuentan — ni suman ni restan al score.
 */

/** Zonas táctiles: mínimo 24×24 CSS px (WCAG 2.5.8 AA). */
const MIN_TARGET = 24;
/** Por debajo de esto el texto corrido es difícil de leer en cualquier pantalla. */
const MIN_BODY_FONT = 12;

export const contrastRule: Rule = {
  id: "visual-contrast",
  effort: "low",
  category: "accessibility",
  maxPenalty: 18,
  severity: "critical",
  wcag: "1.4.3",
  applies: (ctx) => (ctx.visual?.textElements.some((e) => e.contrast !== null) ?? false),
  evaluate(ctx) {
    const measurable = ctx.visual!.textElements.filter((e) => e.contrast !== null);
    const failing = measurable.filter((e) => e.contrast! < e.contrastThreshold);
    if (failing.length === 0) return null;

    // Lo peor primero: es lo que el usuario debe arreglar antes.
    const worst = [...failing].sort((a, b) => a.contrast! - b.contrast!);

    return finding(this, {
      title: {
        en: `${failing.length} text element${failing.length > 1 ? "s" : ""} below the contrast minimum`,
        es: `${failing.length} elemento${failing.length > 1 ? "s" : ""} de texto por debajo del contraste mínimo`,
      },
      description: {
        en: "Measured from the rendered page against the composited background. Text below 4.5:1 (3:1 for large text) is hard to read for anyone in bright light, and unreadable for many people with low vision.",
        es: "Medido sobre la página renderizada contra el fondo real compuesto. El texto por debajo de 4.5:1 (3:1 si es grande) cuesta de leer a cualquiera con luz fuerte, y es ilegible para muchas personas con baja visión.",
      },
      fix: {
        en: "Darken the text or lighten its background until the ratio clears the threshold. Changing the colour token usually fixes many elements at once.",
        es: "Oscurece el texto o aclara su fondo hasta superar el umbral. Cambiar el token de color suele arreglar muchos elementos de golpe.",
      },
      evidence: [
        { detail: `${failing.length} de ${measurable.length} elementos medibles`, count: failing.length },
        ...worst.slice(0, 4).map((e) => ({
          selector: e.selector,
          detail: `${e.contrast}:1 (mínimo ${e.contrastThreshold}:1) · ${e.color} sobre ${e.background}`,
          snippet: e.text,
        })),
      ],
      ratio: Math.min(1, 0.35 + (failing.length / measurable.length) * 0.65),
    });
  },
};

export const fontSizeRule: Rule = {
  id: "visual-font-size",
  effort: "low",
  category: "accessibility",
  maxPenalty: 10,
  severity: "medium",
  applies: (ctx) => (ctx.visual?.textElements.length ?? 0) > 0,
  evaluate(ctx) {
    // Solo texto corrido: una nota legal o un pie de foto pequeños son normales.
    const body = ctx.visual!.textElements.filter((e) => e.text.length > 40);
    if (body.length === 0) return null;

    const tiny = body.filter((e) => e.fontSize < MIN_BODY_FONT);
    if (tiny.length === 0) return null;

    return finding(this, {
      title: {
        en: `${tiny.length} block${tiny.length > 1 ? "s" : ""} of body text under ${MIN_BODY_FONT}px`,
        es: `${tiny.length} bloque${tiny.length > 1 ? "s" : ""} de texto corrido por debajo de ${MIN_BODY_FONT}px`,
      },
      description: {
        en: "Running text this small forces readers to zoom or lean in. It is one of the most common reasons a page feels uncomfortable without anyone being able to say why.",
        es: "El texto corrido a este tamaño obliga a hacer zoom o a acercarse. Es uno de los motivos más frecuentes de que una página resulte incómoda sin que nadie sepa decir por qué.",
      },
      fix: {
        en: "Set body copy at 16px and scale from there. Reserve smaller sizes for captions and legal text.",
        es: "Fija el texto corrido en 16px y escala desde ahí. Reserva los tamaños menores para pies de foto y textos legales.",
      },
      evidence: tiny.slice(0, 4).map((e) => ({
        selector: e.selector,
        detail: `${e.fontSize}px`,
        snippet: e.text,
      })),
      ratio: Math.min(1, 0.4 + (tiny.length / body.length) * 0.6),
    });
  },
};

export const touchTargetRule: Rule = {
  id: "visual-touch-targets",
  effort: "medium",
  category: "accessibility",
  maxPenalty: 12,
  severity: "high",
  wcag: "2.5.8",
  applies: (ctx) => (ctx.visual?.touchTargets.length ?? 0) > 0,
  evaluate(ctx) {
    const targets = ctx.visual!.touchTargets;
    const small = targets.filter((t) => t.rect.w < MIN_TARGET || t.rect.h < MIN_TARGET);
    if (small.length === 0) return null;

    return finding(this, {
      title: {
        en: `${small.length} tap target${small.length > 1 ? "s" : ""} smaller than ${MIN_TARGET}px`,
        es: `${small.length} zona${small.length > 1 ? "s" : ""} táctil${small.length > 1 ? "es" : ""} menor${small.length > 1 ? "es" : ""} de ${MIN_TARGET}px`,
      },
      description: {
        en: `Measured in a 390px mobile viewport. Controls under ${MIN_TARGET}×${MIN_TARGET} are easy to miss with a thumb, which turns into mis-taps and abandoned flows.`,
        es: `Medido en un viewport móvil de 390px. Los controles de menos de ${MIN_TARGET}×${MIN_TARGET} son fáciles de fallar con el pulgar, lo que se traduce en toques erróneos y flujos abandonados.`,
      },
      fix: {
        en: "Add padding rather than growing the icon — the hit area is what matters, not the glyph. 44×44 is the comfortable target.",
        es: "Añade padding en vez de agrandar el icono — lo que cuenta es el área de toque, no el glifo. 44×44 es el objetivo cómodo.",
      },
      evidence: [
        { detail: `${small.length} de ${targets.length} controles`, count: small.length },
        ...small.slice(0, 4).map((t) => ({
          selector: t.selector,
          detail: `${t.rect.w}×${t.rect.h}px`,
          snippet: t.label || `<${t.tag}>`,
        })),
      ],
      ratio: Math.min(1, 0.35 + (small.length / targets.length) * 0.65),
    });
  },
};

export const horizontalScrollRule: Rule = {
  id: "visual-horizontal-scroll",
  effort: "medium",
  category: "hierarchy",
  maxPenalty: 12,
  severity: "high",
  wcag: "1.4.10",
  applies: (ctx) => (ctx.visual?.mobileViewportWidth ?? 0) > 0,
  evaluate(ctx) {
    const { mobileScrollWidth: scroll, mobileViewportWidth: view } = ctx.visual!;
    const overflow = scroll - view;
    // Un par de píxeles suele ser redondeo del navegador, no un fallo real.
    if (overflow <= 4) return null;

    return finding(this, {
      title: {
        en: "The page scrolls sideways on mobile",
        es: "La página se desplaza lateralmente en móvil",
      },
      description: {
        en: "Something is wider than the screen, so the whole layout drifts horizontally as the visitor scrolls down. It reads as broken even when everything else is right.",
        es: "Algo es más ancho que la pantalla, así que todo el diseño se desplaza en horizontal mientras el visitante baja. Se percibe como roto aunque el resto esté bien.",
      },
      fix: {
        en: "Find the overflowing element and cap it with max-width:100%. Usually a wide table, an unbroken string, or a fixed-width image.",
        es: "Localiza el elemento que desborda y acótalo con max-width:100%. Suele ser una tabla ancha, una cadena sin espacios o una imagen de ancho fijo.",
      },
      evidence: [
        { detail: `contenido de ${scroll}px en un viewport de ${view}px (${overflow}px de más)` },
      ],
      ratio: Math.min(1, 0.5 + overflow / view),
    });
  },
};

export const aboveFoldRule: Rule = {
  id: "visual-above-fold",
  effort: "high",
  category: "clarity",
  maxPenalty: 12,
  severity: "medium",
  applies: (ctx) => ctx.visual !== undefined,
  evaluate(ctx) {
    const visual = ctx.visual!;
    const aboveFold = visual.textElements.filter((e) => e.aboveFold);
    const words = visual.aboveFoldText.split(/\s+/).filter(Boolean).length;

    const actionAboveFold = visual.touchTargets.some(
      (t) => t.rect.y < visual.viewport.height && (t.tag === "button" || t.tag === "a")
    );

    // Solo se reporta cuando el primer viewport está claramente vacío de contenido.
    if (words >= 12 && actionAboveFold) return null;
    if (aboveFold.length === 0 && visual.textElements.length === 0) return null;

    const problems: string[] = [];
    if (words < 12) problems.push(`solo ${words} palabras visibles sin desplazar`);
    if (!actionAboveFold) problems.push("ninguna acción visible sin desplazar");

    return finding(this, {
      title: {
        en: "The first screen doesn't say what this is or what to do",
        es: "La primera pantalla no dice qué es esto ni qué hacer",
      },
      description: {
        en: "Measured at 1280×800. Visitors decide whether to stay in the first few seconds, using only what is on screen before they scroll. This page gives them very little to decide with.",
        es: "Medido a 1280×800. Los visitantes deciden si se quedan en los primeros segundos, usando solo lo que hay en pantalla antes de desplazar. Esta página les da muy poco con lo que decidir.",
      },
      fix: {
        en: "Put a sentence that names what this is, and one primary action, inside the first screen.",
        es: "Coloca una frase que diga qué es esto, y una acción principal, dentro de la primera pantalla.",
      },
      evidence: [
        { detail: problems.join(" · ") },
        ...(visual.aboveFoldText ? [{ snippet: visual.aboveFoldText.slice(0, 120) }] : []),
      ],
      ratio: words < 12 && !actionAboveFold ? 1 : 0.5,
    });
  },
};

export const visualRules: Rule[] = [
  contrastRule,
  fontSizeRule,
  touchTargetRule,
  horizontalScrollRule,
  aboveFoldRule,
];
