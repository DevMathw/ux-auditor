import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests del guard SSRF.
 *
 * El DNS está mockeado, así que son deterministas y no tocan internet: la
 * pregunta que responden no es "¿existe este dominio?" sino "¿qué hace el guard
 * cuando el DNS devuelve X?". Eso es exactamente la superficie de ataque —
 * un atacante controla su propio DNS.
 */

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));

const fetchMock = vi.hoisted(() => vi.fn());

let fetchPageHTML: typeof import("@/app/lib/fetchPage").fetchPageHTML;
let isPublicTarget: typeof import("@/app/lib/fetchPage").isPublicTarget;

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  lookup.mockReset();
  const mod = await import("@/app/lib/fetchPage");
  fetchPageHTML = mod.fetchPageHTML;
  isPublicTarget = mod.isPublicTarget;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** El DNS resuelve el hostname a las direcciones indicadas. */
function dnsResolvesTo(...addresses: string[]) {
  lookup.mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }))
  );
}

/** Nuevo Response en cada llamada: un cuerpo sólo se puede leer una vez. */
function htmlResponse(body = "<html><body><p>ok</p></body></html>", status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

function redirectTo(location: string, status = 302) {
  return new Response(null, { status, headers: { location } });
}

describe("direcciones IP literales", () => {
  const blocked: [string, string][] = [
    ["loopback IPv4", "http://127.0.0.1/"],
    ["loopback en otro puerto", "http://127.0.0.1:8080/admin"],
    ["0.0.0.0", "http://0.0.0.0/"],
    ["metadatos de nube", "http://169.254.169.254/latest/meta-data/"],
    ["link-local", "http://169.254.1.1/"],
    ["privada 10/8", "http://10.0.0.1/"],
    ["privada 172.16/12 (inicio)", "http://172.16.0.1/"],
    ["privada 172.31/12 (fin)", "http://172.31.255.254/"],
    ["privada 192.168/16", "http://192.168.1.1/"],
    ["CGNAT 100.64/10", "http://100.64.0.1/"],
    ["multicast", "http://224.0.0.1/"],
    ["loopback IPv6", "http://[::1]/"],
    ["IPv6 sin especificar", "http://[::]/"],
    ["unique-local IPv6 fc00::/7", "http://[fc00::1]/"],
    ["unique-local IPv6 fd00::/8", "http://[fd12:3456::1]/"],
    ["link-local IPv6", "http://[fe80::1]/"],
    ["IPv4 mapeada en IPv6", "http://[::ffff:127.0.0.1]/"],
  ];

  it.each(blocked)("bloquea %s", async (_name, url) => {
    const result = await fetchPageHTML(new URL(url));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("blocked");
    // Lo importante: nunca se llegó a hacer la petición.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permite una IP pública literal", async () => {
    fetchMock.mockImplementation(async () => htmlResponse());
    const result = await fetchPageHTML(new URL("http://93.184.216.34/"));
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("172.15 y 172.32 quedan fuera del rango privado", async () => {
    fetchMock.mockImplementation(async () => htmlResponse());
    expect((await fetchPageHTML(new URL("http://172.15.0.1/"))).ok).toBe(true);
    expect((await fetchPageHTML(new URL("http://172.32.0.1/"))).ok).toBe(true);
  });
});

describe("resolución DNS", () => {
  it("bloquea un dominio que resuelve a loopback", async () => {
    dnsResolvesTo("127.0.0.1");
    const result = await fetchPageHTML(new URL("https://evil.test/"));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bloquea un dominio que resuelve a los metadatos de nube", async () => {
    dnsResolvesTo("169.254.169.254");
    expect((await fetchPageHTML(new URL("https://metadata.test/"))).ok).toBe(false);
  });

  it("bloquea si UNA de varias direcciones es privada", async () => {
    // Defensa contra DNS rebinding: basta una respuesta privada para rechazar.
    dnsResolvesTo("93.184.216.34", "10.0.0.5");
    const result = await fetchPageHTML(new URL("https://mixed.test/"));
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("permite un dominio cuyas direcciones son todas públicas", async () => {
    dnsResolvesTo("93.184.216.34", "93.184.216.35");
    fetchMock.mockImplementation(async () => htmlResponse());
    expect((await fetchPageHTML(new URL("https://example.test/"))).ok).toBe(true);
  });

  it("bloquea cuando el DNS no resuelve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    expect((await fetchPageHTML(new URL("https://nowhere.test/"))).ok).toBe(false);
  });

  it("bloquea cuando el DNS devuelve una lista vacía", async () => {
    lookup.mockResolvedValue([]);
    expect((await fetchPageHTML(new URL("https://empty.test/"))).ok).toBe(false);
  });
});

describe("redirecciones", () => {
  it("bloquea una redirección de host público a IP privada", async () => {
    dnsResolvesTo("93.184.216.34");
    fetchMock.mockResolvedValueOnce(redirectTo("http://169.254.169.254/latest/"));
    const result = await fetchPageHTML(new URL("https://public.test/"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("blocked");
    // Se hizo el primer salto, pero no el segundo.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bloquea una redirección relativa hacia un host privado", async () => {
    lookup.mockImplementation(async (host: string) =>
      host === "public.test"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }]
    );
    fetchMock.mockResolvedValueOnce(redirectTo("https://internal.test/secret"));
    expect((await fetchPageHTML(new URL("https://public.test/"))).ok).toBe(false);
  });

  it("revalida en CADA salto, no sólo en el primero", async () => {
    let call = 0;
    lookup.mockImplementation(async (host: string) => {
      // hop3 es el que resuelve a privada: si sólo se validase el primer salto,
      // esta cadena pasaría.
      const priv = host === "hop3.test";
      return [{ address: priv ? "10.1.2.3" : "93.184.216.34", family: 4 }];
    });
    fetchMock.mockImplementation(async () => {
      call += 1;
      if (call === 1) return redirectTo("https://hop2.test/");
      if (call === 2) return redirectTo("https://hop3.test/");
      return htmlResponse();
    });

    const result = await fetchPageHTML(new URL("https://hop1.test/"));
    expect(result.ok).toBe(false);
    expect(call).toBe(2);
  });

  it("sigue redirecciones legítimas entre hosts públicos", async () => {
    dnsResolvesTo("93.184.216.34");
    fetchMock
      .mockResolvedValueOnce(redirectTo("https://www.example.test/"))
      .mockResolvedValueOnce(htmlResponse("<html><body><h1>hi</h1></body></html>"));

    const result = await fetchPageHTML(new URL("https://example.test/"));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.finalUrl).toBe("https://www.example.test/");
  });

  it("corta una cadena de redirecciones demasiado larga", async () => {
    dnsResolvesTo("93.184.216.34");
    let n = 0;
    fetchMock.mockImplementation(async () => redirectTo(`https://hop${++n}.test/`));
    const result = await fetchPageHTML(new URL("https://start.test/"));
    expect(result.ok).toBe(false);
    // MAX_REDIRECTS = 3, así que no puede quedarse dando vueltas.
    expect(n).toBeLessThanOrEqual(5);
  });
});

describe("protocolo y respuesta", () => {
  it("rechaza protocolos que no son http/https", async () => {
    for (const url of ["file:///etc/passwd", "ftp://host.test/x", "gopher://host.test/"]) {
      expect(await isPublicTarget(new URL(url))).toBe(false);
    }
  });

  it("rechaza una respuesta que no es HTML", async () => {
    dnsResolvesTo("93.184.216.34");
    fetchMock.mockImplementation(async () =>
      new Response("binario", { status: 200, headers: { "content-type": "image/png" } })
    );
    const result = await fetchPageHTML(new URL("https://example.test/img.png"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_html");
  });

  it("rechaza un cuerpo declarado por encima del límite de tamaño", async () => {
    dnsResolvesTo("93.184.216.34");
    fetchMock.mockImplementation(async () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html", "content-length": "99000000" },
      })
    );
    const result = await fetchPageHTML(new URL("https://example.test/"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_large");
  });

  it("trata un error de red como inalcanzable, no como permitido", async () => {
    dnsResolvesTo("93.184.216.34");
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    const result = await fetchPageHTML(new URL("https://example.test/"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unreachable");
  });

  it("trata un status HTTP de error como inalcanzable", async () => {
    dnsResolvesTo("93.184.216.34");
    fetchMock.mockImplementation(async () => htmlResponse("nope", 500));
    expect((await fetchPageHTML(new URL("https://example.test/"))).ok).toBe(false);
  });
});
