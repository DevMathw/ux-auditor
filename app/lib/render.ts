import type { Browser, Route } from "playwright-core";
import {
  isProvider,
  launchBrowser,
  resolveBrowserProvider,
  type BrowserProvider,
} from "./browserProvider";
import { isPublicTarget } from "./fetchPage";
import { log, safeHost } from "./log";

/**
 * Capa de renderizado. Es OPCIONAL, igual que la capa de IA: si no hay
 * navegador disponible la auditoría sigue siendo completa sobre el marcado,
 * solo que sin las reglas visuales. Nada de esto puede tumbar una auditoría.
 */

const NAV_TIMEOUT_MS = 15_000;
const SETTLE_MS = 700;
/** Tope de elementos que traemos del navegador, para acotar el payload. */
const MAX_ELEMENTS = 400;

export const DESKTOP = { width: 1280, height: 800 };
export const MOBILE = { width: 390, height: 844 };

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextElement {
  selector: string;
  tag: string;
  text: string;
  rect: Rect;
  fontSize: number;
  fontWeight: number;
  color: string;
  background: string;
  /** Ratio de contraste WCAG, o null si el fondo no es determinable. */
  contrast: number | null;
  /** Umbral que le aplica (3 para texto grande, 4.5 para el resto). */
  contrastThreshold: number;
  aboveFold: boolean;
}

export interface TargetElement {
  selector: string;
  tag: string;
  label: string;
  rect: Rect;
}

export interface VisualSnapshot {
  viewport: { width: number; height: number };
  /** Texto realmente visible en el primer viewport, sin hacer scroll. */
  aboveFoldText: string;
  textElements: TextElement[];
  /** Medido en viewport móvil: es donde importa. */
  touchTargets: TargetElement[];
  mobileScrollWidth: number;
  mobileViewportWidth: number;
  /** JPEG en base64, para la capa de interpretación multimodal. */
  screenshot: string | null;
  screenshotMediaType: "image/jpeg";
}

/**
 * Qué capa de renderizado hay disponible en este runtime. Lo consulta la ruta
 * de auditoría antes de intentar renderizar, y /api/health para poder decir la
 * verdad sobre lo que el despliegue puede hacer realmente.
 */
export async function renderingAvailable(): Promise<boolean> {
  return isProvider(await resolveBrowserProvider());
}

/**
 * Se ejecuta DENTRO de la página, como IIFE: page.evaluate() evalúa el string
 * como una EXPRESIÓN, así que una función flecha suelta se serializaría como
 * undefined en vez de ejecutarse. Devuelve solo datos serializables.
 * Todo lo que no se puede determinar con certeza se marca como null en vez de
 * adivinarse: un falso positivo de contraste destruye la credibilidad del informe.
 */
const EXTRACT_SCRIPT = `(() => {
  const MAX = ${MAX_ELEMENTS};

  function parseColor(s) {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(parseFloat);
    if (p.length < 3 || p.some(Number.isNaN)) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }

  function luminance(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }

  function contrastRatio(fg, bg) {
    const a = luminance(fg), b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  // Compone el color de fondo subiendo por los ancestros. Devuelve null si
  // encuentra una imagen o degradado: ahi no podemos afirmar nada.
  function effectiveBackground(el) {
    let node = el;
    let depth = 0;
    while (node && node !== document.documentElement.parentNode && depth < 25) {
      const cs = getComputedStyle(node);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = parseColor(cs.backgroundColor);
      if (c && c.a >= 0.95) return c;
      if (c && c.a > 0) return null; // semitransparente: no determinable
      node = node.parentElement;
      depth++;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  function cssPath(el) {
    if (el.id) return el.tagName.toLowerCase() + '#' + el.id;
    const cls = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
    let sel = el.tagName.toLowerCase();
    if (cls.length) sel += '.' + cls.join('.');
    const parent = el.parentElement;
    if (parent && parent !== document.body) {
      const pcls = (parent.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean)[0];
      if (parent.id) return parent.tagName.toLowerCase() + '#' + parent.id + ' > ' + sel;
      if (pcls) return parent.tagName.toLowerCase() + '.' + pcls + ' > ' + sel;
    }
    return sel;
  }

  function isVisible(el, cs, rect) {
    if (rect.width < 1 || rect.height < 1) return false;
    if (cs.visibility === 'hidden' || cs.display === 'none') return false;
    if (parseFloat(cs.opacity) < 0.1) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  }

  // ── Texto con su contraste ──────────────────────────────────────────────
  const vh = window.innerHeight;
  const textElements = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode()) && textElements.length < MAX) {
    // Solo elementos con texto propio, no contenedores que heredan el de sus hijos.
    const own = Array.from(node.childNodes)
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim();
    if (own.length < 2) continue;

    const cs = getComputedStyle(node);
    const r = node.getBoundingClientRect();
    if (!isVisible(node, cs, r)) continue;

    const fg = parseColor(cs.color);
    const bg = effectiveBackground(node);
    const fontSize = parseFloat(cs.fontSize) || 0;
    const fontWeight = parseInt(cs.fontWeight, 10) || 400;
    // WCAG: texto grande = 24px, o 18.66px en negrita
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);

    textElements.push({
      selector: cssPath(node),
      tag: node.tagName.toLowerCase(),
      text: own.slice(0, 90),
      rect: { x: Math.round(r.x), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) },
      fontSize: Math.round(fontSize * 10) / 10,
      fontWeight,
      color: cs.color,
      background: bg ? 'rgb(' + Math.round(bg.r) + ', ' + Math.round(bg.g) + ', ' + Math.round(bg.b) + ')' : 'indeterminado',
      contrast: fg && bg ? Math.round(contrastRatio(fg, bg) * 100) / 100 : null,
      contrastThreshold: isLarge ? 3 : 4.5,
      aboveFold: r.top < vh && r.bottom > 0,
    });
  }

  // ── Texto visible sin hacer scroll ──────────────────────────────────────
  const aboveFoldText = textElements
    .filter((e) => e.aboveFold)
    .map((e) => e.text)
    .join(' ')
    .slice(0, 1200);

  return { textElements, aboveFoldText };
})()`;

const TOUCH_SCRIPT = `(() => {
  function cssPath(el) {
    if (el.id) return el.tagName.toLowerCase() + '#' + el.id;
    const cls = (el.getAttribute('class') || '').trim().split(/\\s+/).filter(Boolean).slice(0, 2);
    let sel = el.tagName.toLowerCase();
    if (cls.length) sel += '.' + cls.join('.');
    return sel;
  }

  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=checkbox]';
  const targets = [];
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    // Un skip link o cualquier elemento "visually hidden" mide 1x1 a proposito
    // hasta recibir foco: reportarlo como zona tactil pequena es un falso
    // positivo, y ademas castiga justo la buena practica de accesibilidad.
    const clipped = (cs.clip && cs.clip !== 'auto') || (cs.clipPath && cs.clipPath !== 'none');
    if (clipped || (r.width <= 4 && r.height <= 4)) continue;
    // Un enlace dentro de un parrafo de texto corrido esta exento en WCAG 2.5.8.
    const inFlowText = el.tagName === 'A' && el.parentElement &&
      ['P','LI','SPAN','TD','DD','DT','BLOCKQUOTE'].includes(el.parentElement.tagName);
    if (inFlowText) continue;

    targets.push({
      selector: cssPath(el),
      tag: el.tagName.toLowerCase(),
      label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 50),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    });
    if (targets.length >= 200) break;
  }

  return {
    touchTargets: targets,
    mobileScrollWidth: document.documentElement.scrollWidth,
    mobileViewportWidth: window.innerWidth,
  };
})()`;

/**
 * Renderiza la página una sola vez y mide en dos viewports: escritorio para
 * contraste, tipografía y captura; móvil para zonas táctiles y desbordamiento.
 */
/**
 * Muchos sitios redirigen o re-renderizan en cliente justo después de cargar,
 * lo que destruye el contexto de ejecución a mitad de un evaluate. Se espera a
 * que la página se asiente y se reintenta una vez.
 */
async function settleAndEvaluate<T>(
  page: import("playwright-core").Page,
  script: string
): Promise<T> {
  try {
    return (await page.evaluate(script)) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes("Execution context was destroyed")) throw err;
    await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    return (await page.evaluate(script)) as T;
  }
}

export async function renderPage(url: string): Promise<VisualSnapshot | null> {
  const provider = await resolveBrowserProvider();
  if (!isProvider(provider)) return null;

  let browser: Browser | null = null;
  try {
    browser = await launchBrowser(provider as BrowserProvider);

    const context = await browser.newContext({
      viewport: DESKTOP,
      userAgent: "Mozilla/5.0 (compatible; UXAuditor/1.0)",
      // Sin permisos ni almacenamiento: la página no debe poder pedirnos nada.
      javaScriptEnabled: true,
    });
    const page = await context.newPage();
    page.setDefaultTimeout(NAV_TIMEOUT_MS);

    // La página ejecuta su propio JavaScript, así que puede intentar pedir
    // http://169.254.169.254 o cualquier IP interna. Se filtra cada petición
    // con la misma comprobación que usa la capa HTTP.
    const decided = new Map<string, boolean>();
    await page.route("**/*", async (route: Route) => {
      const target = route.request().url();
      let allowed = decided.get(target);
      if (allowed === undefined) {
        try {
          allowed = await isPublicTarget(new URL(target));
        } catch {
          allowed = false;
        }
        decided.set(target, allowed);
      }
      if (allowed) await route.continue();
      else await route.abort("blockedbyclient");
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    // Margen para que el contenido pintado en cliente aparezca.
    await page.waitForTimeout(SETTLE_MS);

    const desktop = await settleAndEvaluate<{
      textElements: TextElement[];
      aboveFoldText: string;
    }>(page, EXTRACT_SCRIPT);

    let screenshot: string | null = null;
    try {
      const buf = await page.screenshot({ type: "jpeg", quality: 62, timeout: 10_000 });
      screenshot = buf.toString("base64");
    } catch {
      // Sin captura la auditoría sigue: solo se pierde el análisis multimodal.
    }

    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(250);
    const mobile = await settleAndEvaluate<{
      touchTargets: TargetElement[];
      mobileScrollWidth: number;
      mobileViewportWidth: number;
    }>(page, TOUCH_SCRIPT);

    return {
      viewport: DESKTOP,
      aboveFoldText: desktop.aboveFoldText,
      textElements: desktop.textElements,
      touchTargets: mobile.touchTargets,
      mobileScrollWidth: mobile.mobileScrollWidth,
      mobileViewportWidth: mobile.mobileViewportWidth,
      screenshot,
      screenshotMediaType: "image/jpeg",
    };
  } catch (err) {
    log.warn({ event: "render_unavailable", host: safeHost(url), reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) });
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}
