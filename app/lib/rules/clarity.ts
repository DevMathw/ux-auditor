import { finding, type Rule } from "./types";

export const metaDescriptionRule: Rule = {
  id: "clarity-meta-description",
  effort: "low",
  category: "clarity",
  maxPenalty: 12,
  severity: "medium",
  evaluate(ctx) {
    const content =
      ctx.root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "";

    if (!content) {
      return finding(this, {
        title: { en: "No meta description", es: "Sin meta descripción" },
        description: {
          en: "Search engines and social previews fall back to scraping whatever text they find first, so the snippet people see before clicking is left to chance.",
          es: "Los buscadores y las vistas previas sociales recurren al primer texto que encuentran, así que el fragmento que la gente ve antes de hacer clic queda al azar.",
        },
        fix: {
          en: "Add a 120-160 character description that states what the page offers and why it is worth a click.",
          es: "Añade una descripción de 120-160 caracteres que diga qué ofrece la página y por qué merece un clic.",
        },
        evidence: [{ selector: 'meta[name="description"]', detail: "ausente" }],
      });
    }

    if (content.length >= 70 && content.length <= 165) return null;

    const tooShort = content.length < 70;
    return finding(this, {
      title: {
        en: tooShort ? "Meta description is too short" : "Meta description is too long",
        es: tooShort ? "La meta descripción es demasiado corta" : "La meta descripción es demasiado larga",
      },
      description: {
        en: tooShort
          ? "A very short description wastes the space search engines give you to convince someone to click."
          : "Descriptions beyond roughly 160 characters get truncated with an ellipsis, so the end of your sentence never reaches the reader.",
        es: tooShort
          ? "Una descripción muy corta desaprovecha el espacio que los buscadores te dan para convencer a alguien de hacer clic."
          : "Las descripciones de más de unos 160 caracteres se cortan con puntos suspensivos, así que el final de tu frase nunca llega al lector.",
      },
      fix: {
        en: "Aim for 120-160 characters.",
        es: "Apunta a 120-160 caracteres.",
      },
      evidence: [
        { detail: `${content.length} caracteres (recomendado: 120-160)` },
        { snippet: content.slice(0, 120) },
      ],
      ratio: 0.4,
    });
  },
};

export const titleQualityRule: Rule = {
  id: "clarity-title-quality",
  effort: "low",
  category: "clarity",
  maxPenalty: 10,
  severity: "medium",
  evaluate(ctx) {
    const title = ctx.root.querySelector("title")?.text?.trim() ?? "";
    // La ausencia total la cubre a11y-page-title; aquí solo la calidad.
    if (!title) return null;
    if (title.length >= 15 && title.length <= 60) return null;

    const tooShort = title.length < 15;
    return finding(this, {
      title: {
        en: tooShort ? "Page title is too short to be informative" : "Page title will be truncated",
        es: tooShort ? "El título es demasiado corto para informar" : "El título se va a cortar",
      },
      description: {
        en: tooShort
          ? "A very short title gives neither the user nor a search engine enough to tell this page apart from any other."
          : "Titles longer than about 60 characters are cut off in search results and browser tabs, hiding the end of the sentence.",
        es: tooShort
          ? "Un título muy corto no da ni al usuario ni al buscador lo suficiente para distinguir esta página de cualquier otra."
          : "Los títulos de más de unos 60 caracteres se cortan en resultados de búsqueda y pestañas, ocultando el final de la frase.",
      },
      fix: {
        en: "Aim for 15-60 characters: what this page is, then the site name.",
        es: "Apunta a 15-60 caracteres: qué es esta página y luego el nombre del sitio.",
      },
      evidence: [{ detail: `${title.length} caracteres`, snippet: title.slice(0, 90) }],
      ratio: 0.4,
    });
  },
};

export const callToActionRule: Rule = {
  id: "clarity-call-to-action",
  effort: "high",
  category: "clarity",
  maxPenalty: 12,
  severity: "medium",
  evaluate(ctx) {
    const words = ctx.visibleText.split(/\s+/).filter(Boolean).length;
    if (words < 80) return null;

    const actionable =
      ctx.root.querySelectorAll("button, [role=button]").length +
      ctx.root.querySelectorAll('input[type="submit"]').length +
      ctx.root.querySelectorAll("form").length;

    if (actionable > 0) return null;

    return finding(this, {
      title: { en: "No clear call to action", es: "Sin llamada a la acción clara" },
      description: {
        en: "The page has content but no button, form, or submit control. Nothing tells the visitor what to do next, so the page can only inform — it cannot convert.",
        es: "La página tiene contenido pero ningún botón, formulario ni control de envío. Nada indica al visitante qué hacer a continuación, así que la página solo puede informar — no convertir.",
      },
      fix: {
        en: "Add one primary action, visually dominant and above the fold, phrased as a verb the user wants to perform.",
        es: "Añade una acción principal, visualmente dominante y visible sin desplazar, redactada como un verbo que el usuario quiera ejecutar.",
      },
      evidence: [
        { detail: `${words} palabras de contenido`, },
        { selector: "button, form, input[type=submit]", detail: "0 elementos accionables" },
      ],
    });
  },
};

export const socialPreviewRule: Rule = {
  id: "clarity-social-preview",
  effort: "low",
  category: "clarity",
  maxPenalty: 8,
  severity: "low",
  evaluate(ctx) {
    const has = (prop: string) =>
      ctx.root.querySelectorAll(`meta[property="${prop}"], meta[name="${prop}"]`).length > 0;

    const missing = (["og:title", "og:description", "og:image"] as const).filter((p) => !has(p));
    if (missing.length === 0) return null;

    return finding(this, {
      title: {
        en: "Link previews are incomplete",
        es: "Las vistas previas al compartir están incompletas",
      },
      description: {
        en: "When this URL is pasted into Slack, WhatsApp, or LinkedIn, the preview card falls back to guesswork — usually a bare URL with no image, which measurably reduces clicks.",
        es: "Cuando esta URL se pega en Slack, WhatsApp o LinkedIn, la tarjeta de vista previa se genera a ciegas — normalmente una URL desnuda sin imagen, lo que reduce los clics de forma medible.",
      },
      fix: {
        en: "Add og:title, og:description, and a 1200×630 og:image to the <head>.",
        es: "Añade og:title, og:description y una og:image de 1200×630 al <head>.",
      },
      evidence: [{ detail: `ausentes: ${missing.join(", ")}`, count: missing.length }],
      ratio: missing.length / 3,
    });
  },
};

export const contentDepthRule: Rule = {
  id: "clarity-content-depth",
  effort: "high",
  category: "clarity",
  maxPenalty: 10,
  severity: "low",
  evaluate(ctx) {
    const words = ctx.visibleText.split(/\s+/).filter(Boolean).length;
    if (words >= 60) return null;

    return finding(this, {
      title: { en: "Very little visible text", es: "Muy poco texto visible" },
      description: {
        en: "The server returned under 60 words of visible copy. Either the page genuinely says very little, or the content is rendered by JavaScript after load — in which case search crawlers and this audit both see an empty page.",
        es: "El servidor devolvió menos de 60 palabras de texto visible. O la página dice muy poco, o el contenido lo pinta JavaScript tras la carga — en cuyo caso tanto los rastreadores como esta auditoría ven una página vacía.",
      },
      fix: {
        en: "If the content is client-rendered, add server-side rendering or prerendering so crawlers receive the real copy.",
        es: "Si el contenido se pinta en cliente, añade renderizado en servidor o prerenderizado para que los rastreadores reciban el texto real.",
      },
      evidence: [{ detail: `${words} palabras visibles en el HTML servido` }],
      ratio: 0.5,
    });
  },
};

export const faviconRule: Rule = {
  id: "clarity-favicon",
  effort: "low",
  category: "clarity",
  maxPenalty: 5,
  severity: "low",
  evaluate(ctx) {
    const has = ctx.root.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"]').length > 0;
    if (has) return null;

    return finding(this, {
      title: { en: "No favicon declared", es: "Sin favicon declarado" },
      description: {
        en: "With no icon, the site is a blank page in a wall of pinned tabs and bookmarks — a small but constant cost to recognition.",
        es: "Sin icono, el sitio es una página en blanco en un muro de pestañas fijadas y marcadores — un coste pequeño pero constante en reconocimiento.",
      },
      fix: {
        en: 'Add <link rel="icon" href="/favicon.ico"> and an apple-touch-icon.',
        es: 'Añade <link rel="icon" href="/favicon.ico"> y un apple-touch-icon.',
      },
      evidence: [{ selector: 'link[rel~="icon"]', detail: "ausente" }],
    });
  },
};

export const clarityRules: Rule[] = [
  metaDescriptionRule,
  titleQualityRule,
  callToActionRule,
  socialPreviewRule,
  contentDepthRule,
  faviconRule,
];
