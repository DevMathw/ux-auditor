import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** Tamaño máximo del HTML que aceptamos descargar (1.5 MB). */
const MAX_BYTES = 1_500_000;
/** Timeout de la descarga remota. */
const FETCH_TIMEOUT_MS = 8000;
/** Redirecciones que seguimos manualmente, revalidando cada salto. */
const MAX_REDIRECTS = 3;

export type FetchFailure =
  | "blocked"     // destino privado/interno o protocolo no permitido
  | "unreachable" // DNS, red, timeout o status HTTP de error
  | "not_html"    // el servidor devolvió algo que no es HTML
  | "too_large";  // superó MAX_BYTES

export type FetchPageResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; reason: FetchFailure };

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true; // si no lo entendemos, lo tratamos como no público
  }
  const [a, b] = parts;
  if (a === 0) return true;                          // 0.0.0.0/8
  if (a === 10) return true;                         // privada
  if (a === 127) return true;                        // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true;           // link-local + metadatos de nube
  if (a === 172 && b >= 16 && b <= 31) return true;  // privada
  if (a === 192 && b === 0) return true;             // 192.0.0.0/24 y 192.0.2.0/24
  if (a === 192 && b === 168) return true;           // privada
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true;                         // multicast y reservadas
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase().split("%")[0];
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("::ffff:")) {
    const mapped = s.slice(7);
    return isIP(mapped) === 4 ? isPrivateIPv4(mapped) : true;
  }
  if (s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local
  if (s.startsWith("ff")) return true;                       // multicast
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

/**
 * Rechaza cualquier URL que apunte a la red interna. Resuelve el DNS y exige
 * que TODAS las direcciones devueltas sean públicas, para que un dominio que
 * resuelve a 127.0.0.1 no pueda usarse como puente hacia el servidor.
 *
 * Lo usa también la capa de renderizado para filtrar las subpeticiones que
 * lanza la propia página: sin eso, el navegador reabriría el agujero SSRF que
 * esta comprobación cierra en la capa HTTP.
 */
export async function isPublicTarget(url: URL): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) return false;

  if (isIP(host)) return !isPrivateAddress(host);

  try {
    const addresses = await lookup(host, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** Lee el cuerpo de la respuesta abortando en cuanto supera el límite. */
async function readCapped(res: Response): Promise<string | null> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BYTES) return null;

  const reader = res.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

/**
 * Descarga el HTML de una URL pública. Sigue las redirecciones a mano para
 * revalidar el destino en cada salto (una redirección a 127.0.0.1 sería un SSRF).
 */
export async function fetchPageHTML(input: URL): Promise<FetchPageResult> {
  let current = input;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await isPublicTarget(current))) return { ok: false, reason: "blocked" };

    let res: Response;
    try {
      res = await fetch(current.href, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; UXAuditor/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, reason: "unreachable" };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return { ok: false, reason: "unreachable" };
      try {
        current = new URL(location, current);
      } catch {
        return { ok: false, reason: "blocked" };
      }
      continue;
    }

    if (!res.ok) return { ok: false, reason: "unreachable" };

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/text\/html|application\/xhtml\+xml|^text\/plain/i.test(contentType)) {
      return { ok: false, reason: "not_html" };
    }

    const html = await readCapped(res);
    if (html === null) return { ok: false, reason: "too_large" };

    return { ok: true, html, finalUrl: current.href };
  }

  return { ok: false, reason: "unreachable" };
}
