export type Language = "en" | "es";

export const LANGUAGES: readonly Language[] = ["en", "es"] as const;

export function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "es";
}

/** Etiqueta BCP-47 para `<html lang>` y para formatear fechas. */
export const LOCALES: Record<Language, string> = {
  en: "en-US",
  es: "es-CO",
};

const en = {
  // Cabecera
  eyebrow: "Powered by AI",
  h1a: "UX",
  h1b: "Auditor",
  subtitle:
    "Paste any URL and get a verifiable UX report: 22 automated checks with evidence, plus an AI read of what the page actually communicates.",

  // Formulario
  urlLabel: "Website URL",
  placeholder: "https://example.com",
  runAudit: "Run Audit",
  analyzing: "Analyzing…",
  cancel: "Cancel",
  accessibility: "Accessibility",
  visualHierarchy: "Visual Hierarchy",
  uxClarity: "UX Clarity",

  // Carga
  loadingTitle: "Analyzing your website…",
  steps: [
    "Fetching page content",
    "Running 22 automated checks",
    "Reading the page copy",
    "Assembling the report",
  ],

  // Resultado
  ratings: {
    excellent: "Excellent",
    good: "Good",
    needsWork: "Needs Work",
    critical: "Critical Issues",
  } as Record<string, string>,
  scoreLabels: {
    accessibility: "Accessibility",
    visualHierarchy: "Hierarchy",
    uxClarity: "Clarity",
  } as Record<string, string>,
  categoryLabels: {
    accessibility: "Accessibility",
    hierarchy: "Hierarchy",
    clarity: "Clarity",
  } as Record<string, string>,
  outOf100: "/ 100",
  rerun: "← Run another audit",
  analyzedUrlLabel: "Analyzed URL",
  checksPassed: (passed: number, total: number) => `${passed} of ${total} checks passed`,
  cachedNotice: "Loaded from cache — the page has not changed since the last audit.",
  lowConfidence:
    "Low confidence: the server returned almost no readable content, so this page is likely rendered by JavaScript. What is scored below is the served shell, not what a visitor sees.",
  renderedBadge: "Rendered · includes contrast, type size and tap targets",
  notRenderedNotice:
    "Markup-only audit — contrast, type size and tap-target checks were skipped because no browser was available.",

  // Hallazgos
  findings: "Findings",
  noFindings: "No issues found. This page passes every applicable check.",
  quickWinsTitle: "Start here",
  quickWinsHint: "High impact, low effort — do these first.",
  evidence: "Evidence",
  howToFix: "How to fix",
  explain: "Explain this",
  markResolved: "Mark resolved",
  resolved: "resolved",
  sourceRule: "Verified",
  sourceAi: "AI insight",
  sourceRuleHint: "Detected by an automated check against the page markup",
  sourceAiHint: "Interpretation of the page copy — read it as a judgement call",
  severityLabels: {
    critical: "critical",
    high: "high",
    medium: "medium",
    low: "low",
  } as Record<string, string>,
  impactLabels: {
    high: "high impact",
    medium: "medium impact",
    low: "low impact",
  } as Record<string, string>,
  effortLabels: {
    low: "quick fix",
    medium: "moderate",
    high: "significant work",
  } as Record<string, string>,
  aiDisabledNotice: "Deterministic audit only — the AI layer was unavailable for this run.",

  // Secciones
  summaryTitle: "Summary",
  quickWins: "Quick Wins",
  strengths: "Strengths",

  // Historial y gráfico
  historyTitle: "History",
  clearAll: "Clear all",
  load: "Load",
  deleteEntry: "Delete entry",
  chartTitle: "Score history",

  // Modal
  generating: "Generating explanation…",
  close: "Close",
  explanationFailed: "Could not load explanation.",

  // Exportación
  exportPdf: "Export PDF",
  reportTitle: "UX Audit Report",
  overallScore: "Overall Score",
  generated: "Generated on",
  severity: "Severity",
  impact: "Impact",
  effort: "Effort",

  // Estado vacío
  emptyTitle: "What you get",
  emptyBullets: [
    "22 automated checks against the page markup, each with the evidence that triggered it",
    "A reproducible score — the same page always scores the same",
    "A concrete fix for every issue, ranked by impact and effort",
  ],
  emptyHint: "Try it on any public URL. Nothing is stored on our servers.",

  // Errores del servidor, por código
  errors: {
    invalid_url: "That doesn't look like a valid URL.",
    invalid_protocol: "Only http:// and https:// addresses can be analyzed.",
    invalid_body: "The request was malformed. Please try again.",
    payload_too_large: "The request was too large.",
    rate_limited: "Too many audits in a short time. Please wait a moment.",
    upstream_rate_limited: "The AI service is busy right now. Try again shortly.",
    fetch_blocked: "That address can't be analyzed — only public websites are allowed.",
    fetch_unreachable: "The site couldn't be reached. Check the URL or try again later.",
    fetch_not_html: "That address doesn't return a web page.",
    fetch_too_large: "The page is too large to analyze.",
    model_timeout: "The analysis took too long. Please try again.",
    server_misconfigured: "The server is missing its API key.",
    analysis_failed: "Analysis failed. Please try again.",
    cancelled: "Audit cancelled.",
    network: "Couldn't reach the server. Check your connection.",
  } as Record<string, string>,
};

const es: typeof en = {
  eyebrow: "Impulsado por IA",
  h1a: "Auditor",
  h1b: "UX",
  subtitle:
    "Pega cualquier URL y obtén un informe UX verificable: 22 comprobaciones automáticas con evidencia, más una lectura con IA de lo que la página comunica de verdad.",

  urlLabel: "URL del sitio web",
  placeholder: "https://ejemplo.com",
  runAudit: "Analizar",
  analyzing: "Analizando…",
  cancel: "Cancelar",
  accessibility: "Accesibilidad",
  visualHierarchy: "Jerarquía Visual",
  uxClarity: "Claridad UX",

  loadingTitle: "Analizando tu sitio web…",
  steps: [
    "Descargando el contenido",
    "Ejecutando 22 comprobaciones automáticas",
    "Leyendo los textos de la página",
    "Componiendo el informe",
  ],

  ratings: {
    excellent: "Excelente",
    good: "Bueno",
    needsWork: "Necesita trabajo",
    critical: "Problemas críticos",
  },
  scoreLabels: {
    accessibility: "Accesibilidad",
    visualHierarchy: "Jerarquía",
    uxClarity: "Claridad",
  },
  categoryLabels: {
    accessibility: "Accesibilidad",
    hierarchy: "Jerarquía",
    clarity: "Claridad",
  },
  outOf100: "/ 100",
  rerun: "← Nueva auditoría",
  analyzedUrlLabel: "URL analizada",
  checksPassed: (passed: number, total: number) => `${passed} de ${total} comprobaciones superadas`,
  cachedNotice: "Cargado de caché — la página no ha cambiado desde la última auditoría.",
  lowConfidence:
    "Confianza baja: el servidor devolvió casi nada legible, así que esta página probablemente se pinta con JavaScript. Lo que se puntúa abajo es el esqueleto servido, no lo que ve un visitante.",
  renderedBadge: "Renderizada · incluye contraste, tamaño de texto y zonas táctiles",
  notRenderedNotice:
    "Auditoría solo de marcado — se omitieron las comprobaciones de contraste, tamaño de texto y zonas táctiles porque no había navegador disponible.",

  findings: "Hallazgos",
  noFindings: "Sin problemas. Esta página supera todas las comprobaciones aplicables.",
  quickWinsTitle: "Empieza por aquí",
  quickWinsHint: "Mucho impacto, poco esfuerzo — hazlos primero.",
  evidence: "Evidencia",
  howToFix: "Cómo corregirlo",
  explain: "Explícame esto",
  markResolved: "Marcar resuelto",
  resolved: "resuelto",
  sourceRule: "Verificado",
  sourceAi: "Lectura de IA",
  sourceRuleHint: "Detectado por una comprobación automática sobre el marcado de la página",
  sourceAiHint: "Interpretación de los textos — léelo como un juicio, no como un dato",
  severityLabels: {
    critical: "crítico",
    high: "alto",
    medium: "medio",
    low: "bajo",
  },
  impactLabels: {
    high: "alto impacto",
    medium: "impacto medio",
    low: "bajo impacto",
  },
  effortLabels: {
    low: "corrección rápida",
    medium: "moderado",
    high: "trabajo considerable",
  },
  aiDisabledNotice: "Solo auditoría determinista — la capa de IA no estuvo disponible en esta ejecución.",

  summaryTitle: "Resumen",
  quickWins: "Victorias Rápidas",
  strengths: "Fortalezas",

  historyTitle: "Historial",
  clearAll: "Limpiar todo",
  load: "Cargar",
  deleteEntry: "Eliminar entrada",
  chartTitle: "Progreso histórico",

  generating: "Generando explicación…",
  close: "Cerrar",
  explanationFailed: "No se pudo cargar la explicación.",

  exportPdf: "Exportar PDF",
  reportTitle: "Reporte de Auditoría UX",
  overallScore: "Puntaje General",
  generated: "Generado el",
  severity: "Severidad",
  impact: "Impacto",
  effort: "Esfuerzo",

  emptyTitle: "Qué obtienes",
  emptyBullets: [
    "22 comprobaciones automáticas sobre el marcado, cada una con la evidencia que la disparó",
    "Una puntuación reproducible — la misma página puntúa siempre igual",
    "Una corrección concreta para cada problema, ordenada por impacto y esfuerzo",
  ],
  emptyHint: "Pruébalo con cualquier URL pública. No guardamos nada en nuestros servidores.",

  errors: {
    invalid_url: "Eso no parece una URL válida.",
    invalid_protocol: "Solo se pueden analizar direcciones http:// y https://.",
    invalid_body: "La petición estaba mal formada. Inténtalo de nuevo.",
    payload_too_large: "La petición era demasiado grande.",
    rate_limited: "Demasiadas auditorías en poco tiempo. Espera un momento.",
    upstream_rate_limited: "El servicio de IA está saturado. Inténtalo en unos segundos.",
    fetch_blocked: "Esa dirección no se puede analizar — solo se permiten sitios públicos.",
    fetch_unreachable: "No se pudo acceder al sitio. Revisa la URL o inténtalo más tarde.",
    fetch_not_html: "Esa dirección no devuelve una página web.",
    fetch_too_large: "La página es demasiado grande para analizarla.",
    model_timeout: "El análisis tardó demasiado. Inténtalo de nuevo.",
    server_misconfigured: "Al servidor le falta la clave de API.",
    analysis_failed: "El análisis falló. Inténtalo de nuevo.",
    cancelled: "Auditoría cancelada.",
    network: "No se pudo contactar con el servidor. Revisa tu conexión.",
  },
};

const dictionaries = { en, es };

export type Dictionary = typeof en;

export function t(language: Language): Dictionary {
  return dictionaries[language];
}

/** Traduce un código de error del servidor; si es desconocido, cae en el genérico. */
export function errorMessage(language: Language, code: string): string {
  const dict = t(language);
  return dict.errors[code] ?? dict.errors.analysis_failed;
}
