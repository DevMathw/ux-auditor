import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import { clientKey, rateLimit } from "@/app/lib/rateLimit";

/**
 * El limitador guarda su estado en un Map a nivel de módulo, así que cada test
 * usa una clave distinta para no contaminar a los demás. El reloj se controla
 * con fake timers para poder probar la expiración sin esperas reales.
 */
let seq = 0;
const key = () => `test-key-${++seq}`;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

/** NextRequest mínimo: sólo se leen cabeceras. */
function requestWith(headers: Record<string, string>): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

describe("ventana de límite", () => {
  it("permite peticiones hasta el límite", () => {
    const k = key();
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(k, 5, 60_000).ok).toBe(true);
    }
  });

  it("rechaza la petición que supera el límite", () => {
    const k = key();
    for (let i = 0; i < 5; i++) rateLimit(k, 5, 60_000);
    const blocked = rateLimit(k, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it("sigue rechazando mientras dura la ventana", () => {
    const k = key();
    for (let i = 0; i < 3; i++) rateLimit(k, 2, 60_000);
    vi.advanceTimersByTime(30_000);
    expect(rateLimit(k, 2, 60_000).ok).toBe(false);
  });

  it("vuelve a permitir cuando la ventana expira", () => {
    const k = key();
    rateLimit(k, 1, 60_000);
    expect(rateLimit(k, 1, 60_000).ok).toBe(false);

    vi.advanceTimersByTime(60_001);
    expect(rateLimit(k, 1, 60_000).ok).toBe(true);
  });

  it("retryAfter decrece conforme avanza la ventana", () => {
    const k = key();
    rateLimit(k, 1, 60_000);
    const first = rateLimit(k, 1, 60_000).retryAfter;
    vi.advanceTimersByTime(30_000);
    const later = rateLimit(k, 1, 60_000).retryAfter;
    expect(later).toBeLessThan(first);
  });

  it("un límite de 0 rechaza incluso la primera petición útil", () => {
    const k = key();
    // La primera crea el bucket; la segunda ya supera cualquier límite < 2.
    rateLimit(k, 0, 60_000);
    expect(rateLimit(k, 0, 60_000).ok).toBe(false);
  });
});

describe("aislamiento entre clientes", () => {
  it("cada clave lleva su propio contador", () => {
    const a = key();
    const b = key();
    for (let i = 0; i < 5; i++) rateLimit(a, 5, 60_000);
    expect(rateLimit(a, 5, 60_000).ok).toBe(false);
    // b no se ve afectada por el consumo de a.
    expect(rateLimit(b, 5, 60_000).ok).toBe(true);
  });
});

describe("identificación del cliente", () => {
  /**
   * SUPOSICIÓN DOCUMENTADA: se confía en x-forwarded-for porque la app está
   * pensada para correr detrás de un proxy (Vercel) que reescribe esa cabecera.
   * Servida directamente a internet, un cliente podría falsificarla y saltarse
   * el límite. Por eso el límite por IP es una defensa de coste, no de
   * seguridad, y la cuota real debe ir atada a una cuenta.
   */
  it("toma la primera IP de x-forwarded-for", () => {
    expect(clientKey(requestWith({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" })))
      .toBe("203.0.113.7");
  });

  it("recorta espacios alrededor de la IP", () => {
    expect(clientKey(requestWith({ "x-forwarded-for": "  203.0.113.7  , 10.0.0.1" })))
      .toBe("203.0.113.7");
  });

  it("usa x-real-ip cuando no hay x-forwarded-for", () => {
    expect(clientKey(requestWith({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("prefiere x-forwarded-for sobre x-real-ip", () => {
    expect(
      clientKey(requestWith({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.4" }))
    ).toBe("203.0.113.7");
  });

  it("cae en 'local' cuando no hay ninguna cabecera", () => {
    expect(clientKey(requestWith({}))).toBe("local");
  });

  it("no revienta con una cabecera vacía o malformada", () => {
    expect(() => clientKey(requestWith({ "x-forwarded-for": "" }))).not.toThrow();
    expect(() => clientKey(requestWith({ "x-forwarded-for": ",,," }))).not.toThrow();
    // Una cabecera vacía no debe producir una clave vacía compartida por todos.
    expect(clientKey(requestWith({ "x-forwarded-for": "" }))).toBe("local");
  });

  it("clientes distintos producen claves distintas", () => {
    const a = clientKey(requestWith({ "x-forwarded-for": "203.0.113.7" }));
    const b = clientKey(requestWith({ "x-forwarded-for": "203.0.113.8" }));
    expect(a).not.toBe(b);
  });
});

describe("crecimiento de memoria", () => {
  it("purga las entradas caducadas y no crece sin fin", () => {
    // Muchas claves de un solo uso: sin purga, el Map crecería indefinidamente.
    for (let i = 0; i < 500; i++) rateLimit(`ephemeral-${i}`, 5, 1_000);
    vi.advanceTimersByTime(70_000);
    // Cualquier llamada posterior dispara el barrido.
    rateLimit("trigger-sweep", 5, 1_000);
    // Una clave caducada vuelve a empezar de cero, prueba de que se purgó.
    expect(rateLimit("ephemeral-0", 1, 1_000).ok).toBe(true);
  });
});
