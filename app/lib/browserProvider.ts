import { existsSync } from "node:fs";
import type { Browser } from "playwright-core";

/**
 * Resuelve de dónde sale el Chromium que usa la capa de renderizado.
 *
 * Existe porque el camino que funciona en local no es el que funciona en
 * serverless, y la versión anterior de este código sólo buscaba rutas de
 * disco — lo que significaba que en Vercel el renderizado quedaba desactivado
 * en silencio y las 5 reglas visuales nunca corrían en producción.
 *
 * Orden de resolución, del más barato en frío al más caro:
 *   1. remote  — un navegador que ya está corriendo en otro sitio (CDP)
 *   2. serverless — @sparticuz/chromium, si está instalado
 *   3. local   — un Chrome/Edge instalado en la máquina
 */

export type BrowserProvider =
  | { kind: "remote"; endpoint: string }
  | { kind: "serverless" }
  | { kind: "local"; executablePath: string };

/** Motivo por el que no hay navegador, para poder decirlo en /api/health. */
export type BrowserUnavailable =
  | "no_browser_found"
  | "serverless_package_missing";

const LOCAL_CANDIDATES = [
  process.env.PLAYWRIGHT_EXECUTABLE_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter((p): p is string => Boolean(p));

/**
 * @sparticuz/chromium es una dependencia OPCIONAL: pesa unos 50 MB y sólo hace
 * falta al desplegar en un runtime sin navegador. Se importa dinámicamente para
 * que no lastre la instalación de quien corre el proyecto en local.
 */
interface SparticuzChromium {
  executablePath(): Promise<string>;
  args: string[];
  headless: boolean;
}

/**
 * El especificador va en una variable a propósito: si fuese literal, TypeScript
 * exigiría que el paquete estuviese instalado y el bundler intentaría
 * resolverlo en build. Al ser opcional, tiene que resolverse sólo en runtime.
 */
const SERVERLESS_CHROMIUM_MODULE = "@sparticuz/chromium";

function asChromium(value: unknown): SparticuzChromium | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const target = (candidate.default ?? candidate) as Record<string, unknown>;
  return typeof target.executablePath === "function"
    ? (target as unknown as SparticuzChromium)
    : null;
}

async function loadServerlessChromium(): Promise<SparticuzChromium | null> {
  try {
    const mod: unknown = await import(
      /* webpackIgnore: true */ SERVERLESS_CHROMIUM_MODULE
    );
    return asChromium(mod);
  } catch {
    return null;
  }
}

let cached: BrowserProvider | BrowserUnavailable | undefined;

/** Se resuelve una vez por proceso: en serverless eso es una vez por instancia. */
export async function resolveBrowserProvider(): Promise<
  BrowserProvider | BrowserUnavailable
> {
  if (cached !== undefined) return cached;

  const endpoint = process.env.BROWSER_WS_ENDPOINT;
  if (endpoint) {
    cached = { kind: "remote", endpoint };
    return cached;
  }

  if (await loadServerlessChromium()) {
    cached = { kind: "serverless" };
    return cached;
  }

  const executablePath = LOCAL_CANDIDATES.find((p) => existsSync(p));
  if (executablePath) {
    cached = { kind: "local", executablePath };
    return cached;
  }

  // En un runtime serverless sin el paquete opcional, el motivo concreto ayuda
  // a diagnosticar por qué faltan las reglas visuales.
  cached = process.env.VERCEL ? "serverless_package_missing" : "no_browser_found";
  return cached;
}

/** Sólo para tests: fuerza una nueva resolución. */
export function resetBrowserProviderCache(): void {
  cached = undefined;
}

export function isProvider(
  value: BrowserProvider | BrowserUnavailable
): value is BrowserProvider {
  return typeof value === "object";
}

/**
 * El sandbox de Chrome es la principal defensa mientras ejecutamos JavaScript
 * de terceros, así que sólo se desactiva donde el runtime no puede soportarlo.
 * Los runtimes serverless no tienen user namespaces y lo exigen.
 */
const FORCE_NO_SANDBOX = process.env.PLAYWRIGHT_NO_SANDBOX === "1";

const HARDENING_ARGS = [
  "--disable-dev-shm-usage",
  "--disable-extensions",
  "--disable-background-networking",
  "--no-first-run",
];

export async function launchBrowser(provider: BrowserProvider): Promise<Browser> {
  const { chromium } = await import("playwright-core");

  if (provider.kind === "remote") {
    // El navegador vive en otra máquina: sin coste de arranque en frío y sin
    // ejecutar JavaScript de terceros dentro de nuestro propio runtime.
    return chromium.connectOverCDP(provider.endpoint, { timeout: 20_000 });
  }

  if (provider.kind === "serverless") {
    const serverless = await loadServerlessChromium();
    if (!serverless) throw new Error("@sparticuz/chromium desapareció tras la detección");
    return chromium.launch({
      executablePath: await serverless.executablePath(),
      headless: true,
      // Este build ya viene con los flags que el runtime necesita, incluido
      // --no-sandbox: ahí no es una elección nuestra sino un requisito.
      args: [...serverless.args, ...HARDENING_ARGS],
    });
  }

  return chromium.launch({
    executablePath: provider.executablePath,
    headless: true,
    args: [...HARDENING_ARGS, ...(FORCE_NO_SANDBOX ? ["--no-sandbox"] : [])],
  });
}
