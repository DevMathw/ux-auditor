import type { Localized } from "./types";

/**
 * Documentación de cada regla, en un solo sitio.
 *
 * Vive separada de las reglas para que éstas sigan siendo legibles, y un test
 * comprueba que TODA regla registrada tenga su entrada aquí: si alguien añade
 * una regla y olvida documentarla, el build de CI falla. Así la página pública
 * "How scoring works" no puede desincronizarse del código.
 */
export interface RuleDoc {
  /** Qué mide exactamente. */
  what: Localized;
  /** Cuándo se evalúa y cuándo se considera no aplicable. */
  when: Localized;
  /** Qué NO detecta, para no prometer de más. */
  limitation: Localized;
}

export const RULE_DOCS: Record<string, RuleDoc> = {
  "a11y-html-lang": {
    what: { en: "The <html> element carries a lang attribute.", es: "El elemento <html> tiene atributo lang." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Does not verify the declared language matches the content.", es: "No comprueba que el idioma declarado coincida con el contenido." },
  },
  "a11y-page-title": {
    what: { en: "A non-empty <title> exists.", es: "Existe un <title> con contenido." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Quality of the title is scored separately by clarity-title-quality.", es: "La calidad del título la puntúa aparte clarity-title-quality." },
  },
  "a11y-viewport": {
    what: { en: "A responsive viewport is declared and does not block zoom.", es: "Hay viewport responsive declarado y no bloquea el zoom." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Cannot detect zoom blocked by CSS or JavaScript.", es: "No detecta el zoom bloqueado por CSS o JavaScript." },
  },
  "a11y-image-alt": {
    what: { en: "Every image has an alt attribute; alt=\"\" counts as correct for decorative images.", es: "Toda imagen tiene atributo alt; alt=\"\" cuenta como correcto en decorativas." },
    when: { en: "Only when the page has at least one image not hidden from assistive tech.", es: "Sólo si hay al menos una imagen no oculta a tecnología asistiva." },
    limitation: { en: "Cannot judge whether the alt text is actually descriptive.", es: "No puede juzgar si el texto alternativo es realmente descriptivo." },
  },
  "a11y-main-landmark": {
    what: { en: "A <main> or role=\"main\" region exists.", es: "Existe una región <main> o role=\"main\"." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Does not verify the main region wraps the right content.", es: "No verifica que la región principal envuelva el contenido correcto." },
  },
  "a11y-h1": {
    what: { en: "Exactly one visible H1, ignoring aria-hidden duplicates.", es: "Exactamente un H1 visible, ignorando duplicados aria-hidden." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Does not judge whether the H1 describes the page well.", es: "No juzga si el H1 describe bien la página." },
  },
  "a11y-form-labels": {
    what: { en: "Every form field has a label, aria-label or aria-labelledby.", es: "Todo campo tiene label, aria-label o aria-labelledby." },
    when: { en: "Only when the page has form fields that are not hidden or control types.", es: "Sólo si hay campos que no sean ocultos ni de control." },
    limitation: { en: "A placeholder is deliberately not accepted as a label.", es: "El placeholder no se acepta como etiqueta, deliberadamente." },
  },
  "a11y-button-name": {
    what: { en: "Every button has an accessible name, including via SVG aria-label.", es: "Todo botón tiene nombre accesible, incluido vía aria-label de SVG." },
    when: { en: "Only when the page has visible buttons.", es: "Sólo si hay botones visibles." },
    limitation: { en: "Does not resolve aria-labelledby references to their target text.", es: "No resuelve las referencias aria-labelledby hasta su texto destino." },
  },
  "a11y-link-text": {
    what: { en: "Links do not rely on generic text like \"click here\" or \"read more\".", es: "Los enlaces no dependen de textos genéricos como \"clic aquí\" o \"leer más\"." },
    when: { en: "Only when the page has keyboard-reachable links.", es: "Sólo si hay enlaces alcanzables por teclado." },
    limitation: { en: "The generic-phrase list is finite and English/Spanish only.", es: "La lista de frases genéricas es finita y sólo cubre inglés y español." },
  },
  "a11y-skip-link": {
    what: { en: "A skip-to-content link exists as an in-page anchor.", es: "Existe un enlace de salto al contenido como ancla interna." },
    when: { en: "Only on pages with repeated navigation: 3+ nav links or 15+ links total.", es: "Sólo en páginas con navegación repetida: 3+ enlaces de nav o 15+ en total." },
    limitation: { en: "Does not verify the link becomes visible on focus.", es: "No verifica que el enlace se haga visible al recibir foco." },
  },
  "a11y-positive-tabindex": {
    what: { en: "No element uses a tabindex greater than zero.", es: "Ningún elemento usa tabindex mayor que cero." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Does not evaluate the overall focus order.", es: "No evalúa el orden de foco global." },
  },
  "a11y-iframe-title": {
    what: { en: "Every iframe has a title describing the embedded content.", es: "Todo iframe tiene un title que describe el contenido incrustado." },
    when: { en: "Only when the page has iframes.", es: "Sólo si hay iframes." },
    limitation: { en: "Does not judge whether the title is meaningful.", es: "No juzga si el título es significativo." },
  },
  "hier-heading-order": {
    what: { en: "Heading levels do not skip, e.g. H2 straight to H4.", es: "Los niveles de encabezado no saltan, p. ej. de H2 a H4." },
    when: { en: "Only when the page has two or more headings.", es: "Sólo si hay dos o más encabezados." },
    limitation: { en: "Uses document order, which can differ from visual order.", es: "Usa el orden del documento, que puede diferir del visual." },
  },
  "hier-heading-density": {
    what: { en: "Long content is broken up by headings — under 300 words per heading.", es: "El contenido extenso está dividido por encabezados — menos de 300 palabras por encabezado." },
    when: { en: "Only when the page has 250+ words of visible text.", es: "Sólo si hay 250+ palabras de texto visible." },
    limitation: { en: "Word count is a proxy; some content is legitimately dense.", es: "El recuento de palabras es una aproximación; hay contenido legítimamente denso." },
  },
  "hier-landmarks": {
    what: { en: "The page uses <header>, <nav> and <footer> rather than generic divs.", es: "La página usa <header>, <nav> y <footer> en vez de divs genéricos." },
    when: { en: "Skipped on very short pages missing only one or two regions.", es: "Se omite en páginas muy cortas a las que falten sólo una o dos regiones." },
    limitation: { en: "A single-purpose page may legitimately have no nav.", es: "Una página de propósito único puede legítimamente no tener nav." },
  },
  "hier-inline-styles": {
    what: { en: "Spacing and type come from a system rather than per-element inline styles.", es: "El espaciado y la tipografía salen de un sistema, no de estilos en línea por elemento." },
    when: { en: "Only when 25+ elements carry inline styles and they exceed 15% of all elements.", es: "Sólo si 25+ elementos llevan estilos en línea y superan el 15% del total." },
    limitation: { en: "Some frameworks emit inline styles legitimately; this is a smell, not a defect.", es: "Algunos frameworks emiten estilos en línea legítimamente; es un indicio, no un defecto." },
  },
  "clarity-meta-description": {
    what: { en: "A meta description exists and is 70-165 characters.", es: "Existe meta descripción y mide entre 70 y 165 caracteres." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Does not judge whether the description is compelling.", es: "No juzga si la descripción es persuasiva." },
  },
  "clarity-title-quality": {
    what: { en: "The title is 15-60 characters, so it is informative and not truncated.", es: "El título mide entre 15 y 60 caracteres: informativo y sin cortarse." },
    when: { en: "Only when a title exists; absence is covered by a11y-page-title.", es: "Sólo si hay título; la ausencia la cubre a11y-page-title." },
    limitation: { en: "Character limits are search-engine conventions, not hard rules.", es: "Los límites son convenciones de buscadores, no reglas estrictas." },
  },
  "clarity-call-to-action": {
    what: { en: "The page offers at least one button, form or submit control.", es: "La página ofrece al menos un botón, formulario o control de envío." },
    when: { en: "Only when the page has 80+ words of content.", es: "Sólo si la página tiene 80+ palabras de contenido." },
    limitation: { en: "A link can be a valid call to action and is not counted here.", es: "Un enlace puede ser una llamada a la acción válida y aquí no cuenta." },
  },
  "clarity-social-preview": {
    what: { en: "og:title, og:description and og:image are present for link previews.", es: "Están og:title, og:description y og:image para las vistas previas." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Does not fetch the image to verify it exists or its dimensions.", es: "No descarga la imagen para comprobar que existe ni sus dimensiones." },
  },
  "clarity-content-depth": {
    what: { en: "The served HTML contains at least 60 words of visible copy.", es: "El HTML servido contiene al menos 60 palabras de texto visible." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Flags client-rendered pages; rendering the page resolves the ambiguity.", es: "Señala páginas pintadas en cliente; renderizarlas resuelve la ambigüedad." },
  },
  "clarity-favicon": {
    what: { en: "A favicon is declared via a link[rel~=icon].", es: "Hay favicon declarado mediante link[rel~=icon]." },
    when: { en: "Every page.", es: "Todas las páginas." },
    limitation: { en: "Does not check the icon file actually loads.", es: "No comprueba que el fichero del icono cargue realmente." },
  },
  "visual-contrast": {
    what: { en: "Text meets WCAG contrast — 4.5:1, or 3:1 for large text — measured against the composited background.", es: "El texto cumple el contraste WCAG — 4.5:1, o 3:1 si es grande — medido contra el fondo compuesto." },
    when: { en: "Only when the page is rendered and at least one background is determinable.", es: "Sólo si la página se renderiza y hay al menos un fondo determinable." },
    limitation: { en: "Text over gradients or images is reported as indeterminate rather than guessed.", es: "El texto sobre degradados o imágenes se reporta como indeterminado en vez de adivinarse." },
  },
  "visual-font-size": {
    what: { en: "Running text is at least 12px as rendered.", es: "El texto corrido mide al menos 12px renderizado." },
    when: { en: "Only for text blocks longer than 40 characters, so captions are exempt.", es: "Sólo para bloques de más de 40 caracteres, así que los pies de foto quedan exentos." },
    limitation: { en: "Measured at a 1280px desktop viewport only.", es: "Medido sólo en viewport de escritorio de 1280px." },
  },
  "visual-touch-targets": {
    what: { en: "Interactive controls are at least 24x24 CSS pixels (WCAG 2.5.8).", es: "Los controles interactivos miden al menos 24x24 px CSS (WCAG 2.5.8)." },
    when: { en: "Measured in a 390px mobile viewport; visually hidden and in-text links are excluded.", es: "Medido en viewport móvil de 390px; se excluyen los ocultos visualmente y los enlaces en texto corrido." },
    limitation: { en: "Does not measure spacing between adjacent targets.", es: "No mide el espaciado entre controles adyacentes." },
  },
  "visual-horizontal-scroll": {
    what: { en: "Page content is not wider than a phone screen.", es: "El contenido no es más ancho que la pantalla de un móvil." },
    when: { en: "Only when the page is rendered; a 4px tolerance absorbs browser rounding.", es: "Sólo si la página se renderiza; una tolerancia de 4px absorbe el redondeo del navegador." },
    limitation: { en: "Does not identify which element overflows.", es: "No identifica qué elemento concreto desborda." },
  },
  "visual-above-fold": {
    what: { en: "The first screen contains enough copy to orient the visitor and a visible action.", es: "La primera pantalla contiene texto suficiente para orientar y una acción visible." },
    when: { en: "Only when the page is rendered; measured at 1280x800.", es: "Sólo si la página se renderiza; medido a 1280x800." },
    limitation: { en: "One viewport size cannot represent every device.", es: "Un solo tamaño de viewport no representa todos los dispositivos." },
  },
};
