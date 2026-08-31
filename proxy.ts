import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP con nonce por petición.
 *
 * Por qué existe: `script-src 'unsafe-inline'` es lo primero que señala una
 * revisión de seguridad, porque anula la protección de la CSP frente a XSS.
 * Next inyecta scripts inline (el payload RSC), así que la única forma de
 * quitarlo es un nonce por petición combinado con 'strict-dynamic'.
 *
 * Qué cuesta: los nonces obligan a renderizado dinámico, así que `/` deja de
 * servirse prerenderizada. Es un intercambio deliberado — el coste medido está
 * en docs/measurements.md.
 *
 * Qué NO se puede arreglar con nonce: `style-src` conserva 'unsafe-inline'.
 * Los nonces aplican a elementos <style>, no a atributos `style=`, y la interfaz
 * usa estilos en línea de forma intensiva. Cambiarlo exigiría reescribir la capa
 * de presentación entera para ganar poco: un atributo style no puede ejecutar
 * JavaScript.
 */

const STATIC_ASSET = /\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|txt|xml)$/i;

function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' hace que los scripts cargados por uno con nonce válido
    // hereden la confianza, que es como Next carga sus propios chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  // Next lee x-nonce para etiquetar los scripts que inyecta.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  /*
   * Solo documentos HTML. Los assets estáticos y las rutas de API no ejecutan
   * scripts inline, así que hacerlos pasar por aquí sería coste sin beneficio.
   */
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

export { STATIC_ASSET };
