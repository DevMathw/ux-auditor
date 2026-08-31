import {
  accessibleName,
  describe,
  finding,
  isAriaHidden,
  snippet,
  type Rule,
  type RuleContext,
} from "./types";

/** Enlaces que cuentan: visibles para tecnología asistiva y alcanzables por teclado. */
function visibleLinks(root: RuleContext["root"]) {
  return root
    .querySelectorAll("a[href]")
    .filter((a) => !isAriaHidden(a) && a.getAttribute("tabindex") !== "-1");
}

/** Campos de formulario reales (excluye los de control y los ocultos). */
function formFields(root: RuleContext["root"]) {
  return root.querySelectorAll("input, select, textarea").filter((f) => {
    const type = (f.getAttribute("type") ?? "").toLowerCase();
    return !["hidden", "submit", "button", "reset", "image"].includes(type);
  });
}

const GENERIC_LINK_TEXT = [
  "click here", "here", "read more", "more", "learn more", "link", "this",
  "aquí", "aqui", "clic aquí", "leer más", "leer mas", "más", "mas", "ver más", "ver mas",
];

export const htmlLangRule: Rule = {
  id: "a11y-html-lang",
  effort: "low",
  category: "accessibility",
  maxPenalty: 14,
  severity: "critical",
  wcag: "3.1.1",
  evaluate(ctx) {
    const html = ctx.root.querySelector("html");
    const lang = html?.getAttribute("lang")?.trim();
    if (lang) return null;
    return finding(this, {
      title: {
        en: "The page declares no language",
        es: "La página no declara idioma",
      },
      description: {
        en: "The <html> element has no lang attribute, so screen readers cannot choose the right pronunciation rules and browsers cannot offer translation.",
        es: "El elemento <html> no tiene atributo lang, así que los lectores de pantalla no pueden elegir las reglas de pronunciación correctas ni el navegador ofrecer traducción.",
      },
      fix: {
        en: 'Add the language to the root element, e.g. <html lang="en">.',
        es: 'Añade el idioma al elemento raíz, por ejemplo <html lang="es">.',
      },
      evidence: [{ selector: "html", detail: "lang ausente", snippet: "<html>" }],
    });
  },
};

export const pageTitleRule: Rule = {
  id: "a11y-page-title",
  effort: "low",
  category: "accessibility",
  maxPenalty: 12,
  severity: "critical",
  wcag: "2.4.2",
  evaluate(ctx) {
    const title = ctx.root.querySelector("title")?.text?.trim() ?? "";
    if (title) return null;
    return finding(this, {
      title: { en: "The page has no title", es: "La página no tiene título" },
      description: {
        en: "There is no non-empty <title>. It is the first thing a screen reader announces and what appears in tabs, bookmarks, and search results.",
        es: "No hay un <title> con contenido. Es lo primero que anuncia un lector de pantalla y lo que aparece en pestañas, marcadores y resultados de búsqueda.",
      },
      fix: {
        en: "Add a unique <title> that names the page and the site, under 60 characters.",
        es: "Añade un <title> único que nombre la página y el sitio, de menos de 60 caracteres.",
      },
      evidence: [{ selector: "head > title", detail: "ausente o vacío" }],
    });
  },
};

export const viewportRule: Rule = {
  id: "a11y-viewport",
  effort: "low",
  category: "accessibility",
  maxPenalty: 12,
  severity: "critical",
  wcag: "1.4.4",
  evaluate(ctx) {
    const meta = ctx.root.querySelector('meta[name="viewport"]');
    const content = meta?.getAttribute("content") ?? "";
    if (!content) {
      return finding(this, {
        title: { en: "No responsive viewport declared", es: "Sin viewport responsive declarado" },
        description: {
          en: "Without a viewport meta tag, mobile browsers render the page at desktop width and scale it down, making text unreadable.",
          es: "Sin la meta viewport, los navegadores móviles renderizan la página con ancho de escritorio y la reducen, dejando el texto ilegible.",
        },
        fix: {
          en: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.',
          es: 'Añade <meta name="viewport" content="width=device-width, initial-scale=1"> al <head>.',
        },
        evidence: [{ selector: 'meta[name="viewport"]', detail: "ausente" }],
      });
    }
    const blocksZoom =
      /user-scalable\s*=\s*(no|0)/i.test(content) ||
      /maximum-scale\s*=\s*(1(\.0+)?|0?\.\d+)\b/i.test(content);
    if (!blocksZoom) return null;
    return finding(this, {
      title: { en: "Zoom is disabled on mobile", es: "El zoom está desactivado en móvil" },
      description: {
        en: "The viewport blocks pinch-to-zoom. Users with low vision rely on zoom to read; disabling it is a WCAG failure.",
        es: "El viewport bloquea el zoom con dos dedos. Las personas con baja visión dependen del zoom para leer; desactivarlo incumple WCAG.",
      },
      fix: {
        en: "Remove user-scalable=no and any maximum-scale below 2 from the viewport content.",
        es: "Elimina user-scalable=no y cualquier maximum-scale menor que 2 del contenido del viewport.",
      },
      evidence: [{ selector: 'meta[name="viewport"]', snippet: `content="${content}"` }],
      ratio: 0.7,
    });
  },
};

export const imageAltRule: Rule = {
  id: "a11y-image-alt",
  effort: "medium",
  category: "accessibility",
  maxPenalty: 14,
  severity: "high",
  wcag: "1.1.1",
  applies: (ctx) => ctx.root.querySelectorAll("img").some((i) => !isAriaHidden(i)),
  evaluate(ctx) {
    const imgs = ctx.root.querySelectorAll("img").filter((i) => !isAriaHidden(i));
    if (imgs.length === 0) return null;
    // alt="" es correcto para imágenes decorativas: solo falla si no existe el atributo.
    const missing = imgs.filter((img) => img.getAttribute("alt") === undefined);
    if (missing.length === 0) return null;

    const ratio = missing.length / imgs.length;
    return finding(this, {
      title: {
        en: `${missing.length} image${missing.length > 1 ? "s" : ""} without an alt attribute`,
        es: `${missing.length} imagen${missing.length > 1 ? "es" : ""} sin atributo alt`,
      },
      description: {
        en: "Screen readers announce the file name when alt is absent. Decorative images need alt=\"\"; meaningful ones need a description.",
        es: 'Los lectores de pantalla leen el nombre del archivo cuando falta alt. Las imágenes decorativas necesitan alt=""; las informativas, una descripción.',
      },
      fix: {
        en: 'Add alt="" to decorative images and a short description to the rest.',
        es: 'Añade alt="" a las decorativas y una descripción breve al resto.',
      },
      evidence: [
        { detail: `${missing.length} de ${imgs.length} imágenes`, count: missing.length },
        ...missing.slice(0, 3).map((img) => ({
          selector: describe(img),
          snippet: snippet(img, 100),
        })),
      ],
      ratio: 0.3 + ratio * 0.7,
    });
  },
};

export const mainLandmarkRule: Rule = {
  id: "a11y-main-landmark",
  effort: "low",
  category: "accessibility",
  maxPenalty: 10,
  severity: "high",
  wcag: "1.3.1",
  evaluate(ctx) {
    const hasMain =
      ctx.root.querySelectorAll("main").length > 0 ||
      ctx.root.querySelectorAll('[role="main"]').length > 0;
    if (hasMain) return null;
    return finding(this, {
      title: { en: "No main landmark", es: "Sin región principal (main)" },
      description: {
        en: "There is no <main> or role=\"main\". Screen reader users jump straight to the main region; without it they must traverse the whole page.",
        es: 'No hay <main> ni role="main". Quien usa lector de pantalla salta directo a la región principal; sin ella debe recorrer toda la página.',
      },
      fix: {
        en: "Wrap the primary content of the page in a single <main> element.",
        es: "Envuelve el contenido principal de la página en un único elemento <main>.",
      },
      evidence: [{ selector: "main, [role=main]", detail: "0 encontrados" }],
    });
  },
};

export const h1Rule: Rule = {
  id: "a11y-h1",
  effort: "low",
  category: "accessibility",
  maxPenalty: 10,
  severity: "high",
  wcag: "1.3.1",
  evaluate(ctx) {
    // Un H1 aria-hidden es un duplicado decorativo: no existe para el lector de pantalla.
    const h1s = ctx.root
      .querySelectorAll("h1")
      .filter((h) => h.text.trim() && !isAriaHidden(h));
    if (h1s.length === 1) return null;

    if (h1s.length === 0) {
      return finding(this, {
        title: { en: "No H1 heading", es: "Sin encabezado H1" },
        description: {
          en: "The page has no H1, so there is no single statement of what this page is about for either assistive tech or search engines.",
          es: "La página no tiene H1, así que no hay una declaración única de de qué trata para la tecnología asistiva ni para los buscadores.",
        },
        fix: {
          en: "Add exactly one H1 that names the page's purpose.",
          es: "Añade exactamente un H1 que nombre el propósito de la página.",
        },
        evidence: [{ selector: "h1", detail: "0 encontrados" }],
      });
    }

    return finding(this, {
      title: { en: `${h1s.length} H1 headings on one page`, es: `${h1s.length} encabezados H1 en una página` },
      description: {
        en: "Multiple H1s flatten the document outline: nothing signals which heading is the page's actual subject.",
        es: "Varios H1 aplanan el esquema del documento: nada indica cuál es el asunto real de la página.",
      },
      fix: {
        en: "Keep one H1 and demote the others to H2.",
        es: "Deja un único H1 y baja los demás a H2.",
      },
      evidence: h1s.slice(0, 4).map((h) => ({ selector: describe(h), snippet: h.text.trim().slice(0, 70) })),
      ratio: 0.4,
    });
  },
};

export const formLabelRule: Rule = {
  id: "a11y-form-labels",
  effort: "medium",
  category: "accessibility",
  maxPenalty: 14,
  severity: "high",
  wcag: "3.3.2",
  applies: (ctx) => formFields(ctx.root).length > 0,
  evaluate(ctx) {
    const fields = formFields(ctx.root);
    if (fields.length === 0) return null;

    const labelFor = new Set(
      ctx.root
        .querySelectorAll("label[for]")
        .map((l) => l.getAttribute("for"))
        .filter(Boolean) as string[]
    );

    const unlabeled = fields.filter((f) => {
      if (f.getAttribute("aria-label")?.trim()) return false;
      if (f.getAttribute("aria-labelledby")?.trim()) return false;
      if (f.getAttribute("title")?.trim()) return false;
      const id = f.getAttribute("id");
      if (id && labelFor.has(id)) return false;
      // <label><input …></label>
      let parent = f.parentNode;
      for (let depth = 0; parent && depth < 3; depth++) {
        if (parent.rawTagName?.toLowerCase() === "label") return false;
        parent = parent.parentNode;
      }
      return true;
    });

    if (unlabeled.length === 0) return null;

    return finding(this, {
      title: {
        en: `${unlabeled.length} form field${unlabeled.length > 1 ? "s" : ""} with no label`,
        es: `${unlabeled.length} campo${unlabeled.length > 1 ? "s" : ""} de formulario sin etiqueta`,
      },
      description: {
        en: "These fields have no <label>, aria-label, or aria-labelledby. A screen reader announces them as just \"edit text\", and a placeholder does not count — it disappears on typing.",
        es: 'Estos campos no tienen <label>, aria-label ni aria-labelledby. Un lector de pantalla los anuncia solo como "campo de texto", y el placeholder no cuenta: desaparece al escribir.',
      },
      fix: {
        en: "Associate a visible <label for> with each field, or add aria-label when the design has no room for visible text.",
        es: "Asocia un <label for> visible a cada campo, o añade aria-label cuando el diseño no admita texto visible.",
      },
      evidence: [
        { detail: `${unlabeled.length} de ${fields.length} campos`, count: unlabeled.length },
        ...unlabeled.slice(0, 3).map((f) => ({ selector: describe(f), snippet: snippet(f, 100) })),
      ],
      ratio: 0.4 + (unlabeled.length / fields.length) * 0.6,
    });
  },
};

export const buttonNameRule: Rule = {
  id: "a11y-button-name",
  effort: "low",
  category: "accessibility",
  maxPenalty: 10,
  severity: "high",
  wcag: "4.1.2",
  applies: (ctx) =>
    ctx.root.querySelectorAll('button, [role="button"]').some((b) => !isAriaHidden(b)),
  evaluate(ctx) {
    const buttons = ctx.root
      .querySelectorAll('button, [role="button"]')
      .filter((b) => !isAriaHidden(b));
    if (buttons.length === 0) return null;
    const unnamed = buttons.filter((b) => !accessibleName(b));
    if (unnamed.length === 0) return null;

    return finding(this, {
      title: {
        en: `${unnamed.length} button${unnamed.length > 1 ? "s" : ""} with no accessible name`,
        es: `${unnamed.length} botón${unnamed.length > 1 ? "es" : ""} sin nombre accesible`,
      },
      description: {
        en: "Icon-only buttons with no text, aria-label, or titled image are announced as just \"button\". The user cannot know what they do.",
        es: 'Los botones de solo icono sin texto, aria-label ni imagen con alt se anuncian solo como "botón". El usuario no puede saber qué hacen.',
      },
      fix: {
        en: 'Add aria-label to icon buttons, e.g. <button aria-label="Close">.',
        es: 'Añade aria-label a los botones de icono, por ejemplo <button aria-label="Cerrar">.',
      },
      evidence: unnamed.slice(0, 4).map((b) => ({ selector: describe(b), snippet: snippet(b, 90) })),
      ratio: 0.4 + (unnamed.length / buttons.length) * 0.6,
    });
  },
};

export const linkTextRule: Rule = {
  id: "a11y-link-text",
  effort: "medium",
  category: "accessibility",
  maxPenalty: 8,
  severity: "medium",
  wcag: "2.4.4",
  applies: (ctx) => visibleLinks(ctx.root).length > 0,
  evaluate(ctx) {
    const links = visibleLinks(ctx.root);
    if (links.length === 0) return null;

    const vague = links.filter((a) => {
      const name = accessibleName(a).toLowerCase().replace(/[^\p{L}\s]/gu, "").trim();
      return name.length > 0 && GENERIC_LINK_TEXT.includes(name);
    });
    const empty = links.filter((a) => !accessibleName(a));
    const total = vague.length + empty.length;
    if (total === 0) return null;

    return finding(this, {
      title: {
        en: `${total} link${total > 1 ? "s" : ""} with uninformative text`,
        es: `${total} enlace${total > 1 ? "s" : ""} con texto poco informativo`,
      },
      description: {
        en: "Screen reader users often navigate by pulling up a list of every link. Out of context, \"click here\" and \"read more\" say nothing about the destination.",
        es: 'Quien usa lector de pantalla suele navegar sacando una lista de todos los enlaces. Fuera de contexto, "clic aquí" o "leer más" no dicen nada del destino.',
      },
      fix: {
        en: "Rewrite link text so it names the destination, e.g. \"Read the 2026 pricing guide\" instead of \"read more\".",
        es: 'Reescribe el texto para que nombre el destino, por ejemplo "Leer la guía de precios 2026" en lugar de "leer más".',
      },
      evidence: [...empty, ...vague].slice(0, 4).map((a) => ({
        selector: describe(a),
        snippet: `${accessibleName(a) || "(sin texto)"} → ${a.getAttribute("href")?.slice(0, 50) ?? ""}`,
      })),
      ratio: Math.min(1, 0.3 + total / Math.max(links.length, 1)),
    });
  },
};

export const skipLinkRule: Rule = {
  id: "a11y-skip-link",
  effort: "low",
  category: "accessibility",
  maxPenalty: 6,
  severity: "medium",
  wcag: "2.4.1",
  // Sin navegación repetida no hay nada que saltar.
  applies: (ctx) =>
    ctx.root.querySelectorAll("nav a").length >= 3 ||
    ctx.root.querySelectorAll("a[href]").length >= 15,
  evaluate(ctx) {
    const links = ctx.root.querySelectorAll("a[href]");
    const navLinks = ctx.root.querySelectorAll("nav a").length;
    const hasSkip = ctx.root.querySelectorAll('a[href^="#"]').some((a) => {
      const t = a.text.trim().toLowerCase();
      return /\b(skip|saltar|jump|ir al contenido)\b/.test(t);
    });
    if (hasSkip) return null;

    return finding(this, {
      title: { en: "No skip-to-content link", es: "Sin enlace para saltar al contenido" },
      description: {
        en: "Keyboard users must tab through every navigation link on every page before reaching the content.",
        es: "Quien navega con teclado debe tabular por todos los enlaces de navegación en cada página antes de llegar al contenido.",
      },
      fix: {
        en: 'Add <a href="#main" class="skip-link">Skip to content</a> as the first focusable element, visible on focus.',
        es: 'Añade <a href="#main" class="skip-link">Saltar al contenido</a> como primer elemento enfocable, visible al recibir foco.',
      },
      evidence: [{ detail: `${navLinks} enlaces de navegación, ${links.length} enlaces en total`, selector: 'a[href^="#"]' }],
    });
  },
};

export const positiveTabindexRule: Rule = {
  id: "a11y-positive-tabindex",
  effort: "medium",
  category: "accessibility",
  maxPenalty: 6,
  severity: "medium",
  wcag: "2.4.3",
  evaluate(ctx) {
    const offenders = ctx.root
      .querySelectorAll("[tabindex]")
      .filter((el) => Number(el.getAttribute("tabindex")) > 0);
    if (offenders.length === 0) return null;

    return finding(this, {
      title: {
        en: `${offenders.length} element${offenders.length > 1 ? "s" : ""} with a positive tabindex`,
        es: `${offenders.length} elemento${offenders.length > 1 ? "s" : ""} con tabindex positivo`,
      },
      description: {
        en: "A positive tabindex pulls elements out of the natural focus order, so keyboard focus jumps around the page unpredictably.",
        es: "Un tabindex positivo saca elementos del orden natural de foco, de modo que el foco de teclado salta por la página de forma impredecible.",
      },
      fix: {
        en: "Use tabindex=\"0\" (or no tabindex at all) and let DOM order define the focus sequence.",
        es: 'Usa tabindex="0" (o ninguno) y deja que el orden del DOM defina la secuencia de foco.',
      },
      evidence: offenders.slice(0, 4).map((el) => ({
        selector: describe(el),
        snippet: `tabindex="${el.getAttribute("tabindex")}"`,
      })),
    });
  },
};

export const iframeTitleRule: Rule = {
  id: "a11y-iframe-title",
  effort: "low",
  category: "accessibility",
  maxPenalty: 5,
  severity: "medium",
  wcag: "4.1.2",
  applies: (ctx) => ctx.root.querySelectorAll("iframe").length > 0,
  evaluate(ctx) {
    const frames = ctx.root.querySelectorAll("iframe");
    if (frames.length === 0) return null;
    const untitled = frames.filter((f) => !f.getAttribute("title")?.trim());
    if (untitled.length === 0) return null;

    return finding(this, {
      title: {
        en: `${untitled.length} iframe${untitled.length > 1 ? "s" : ""} without a title`,
        es: `${untitled.length} iframe${untitled.length > 1 ? "s" : ""} sin título`,
      },
      description: {
        en: "An untitled iframe is announced as just \"frame\", giving no clue about the embedded content.",
        es: 'Un iframe sin título se anuncia solo como "marco", sin pista alguna sobre el contenido incrustado.',
      },
      fix: {
        en: 'Add a title describing the embed, e.g. <iframe title="Product demo video">.',
        es: 'Añade un title que describa el contenido, por ejemplo <iframe title="Vídeo de demostración">.',
      },
      evidence: untitled.slice(0, 3).map((f) => ({
        selector: describe(f),
        snippet: `src="${(f.getAttribute("src") ?? "").slice(0, 60)}"`,
      })),
    });
  },
};

export const accessibilityRules: Rule[] = [
  htmlLangRule,
  pageTitleRule,
  viewportRule,
  imageAltRule,
  mainLandmarkRule,
  h1Rule,
  formLabelRule,
  buttonNameRule,
  linkTextRule,
  skipLinkRule,
  positiveTabindexRule,
  iframeTitleRule,
];
