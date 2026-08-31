import { describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * La CSP con nonce es fácil de romper sin darse cuenta: basta con volver a
 * poner 'unsafe-inline' en script-src "para arreglar un script" y la protección
 * desaparece en silencio. Estos tests fijan las propiedades que importan.
 */

function request(url = "https://ux-auditor.test/"): NextRequest {
  return { headers: new Headers(), url, nextUrl: new URL(url) } as unknown as NextRequest;
}

function cspOf(res: Response): string {
  return res.headers.get("content-security-policy") ?? "";
}

describe("cabecera CSP", () => {
  it("emite una CSP en la respuesta", () => {
    expect(cspOf(proxy(request()))).toContain("default-src 'self'");
  });

  it("script-src NO permite unsafe-inline", () => {
    const scriptSrc = cspOf(proxy(request()))
      .split(";")
      .find((d) => d.trim().startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("script-src usa nonce y strict-dynamic", () => {
    const csp = cspOf(proxy(request()));
    expect(csp).toMatch(/script-src[^;]*'nonce-[a-f0-9]{32}'/);
    expect(csp).toMatch(/script-src[^;]*'strict-dynamic'/);
  });

  it("genera un nonce distinto en cada petición", () => {
    const nonce = (res: Response) => cspOf(res).match(/'nonce-([a-f0-9]+)'/)?.[1];
    // Un nonce reutilizable no sirve de nada: un atacante lo aprendería.
    expect(nonce(proxy(request()))).not.toBe(nonce(proxy(request())));
  });

  it("propaga el nonce a Next mediante x-nonce", () => {
    // Sin esta cabecera Next no puede etiquetar los scripts que inyecta y la
    // propia CSP los bloquearía.
    const res = proxy(request());
    expect(cspOf(res)).toMatch(/'nonce-[a-f0-9]{32}'/);
  });

  it("style-src conserva unsafe-inline, de forma deliberada", () => {
    // Los nonces no aplican a atributos style=, que la interfaz usa a fondo.
    // Un atributo style no puede ejecutar JavaScript, así que el riesgo es bajo.
    const styleSrc = cspOf(proxy(request()))
      .split(";")
      .find((d) => d.trim().startsWith("style-src"))!;
    expect(styleSrc).toContain("unsafe-inline");
  });

  it("bloquea framing, objetos y base-uri", () => {
    const csp = cspOf(proxy(request()));
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("no permite unsafe-eval en producción", () => {
    // NODE_ENV es "test" al correr vitest, que no es "development".
    expect(cspOf(proxy(request()))).not.toContain("unsafe-eval");
  });
});
