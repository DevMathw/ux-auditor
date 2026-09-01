import { describe, expect, it } from "vitest";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, attachSession, clearSession, ensureSession, readSession } from "@/app/lib/session";

/**
 * La sesión anónima es la única credencial que separa el historial de una
 * persona del de otra. Si aceptase cualquier cadena, bastaría con inventarse
 * una cookie para leer lo ajeno — de ahí que el formato se compruebe.
 */

const VALID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function request(cookie?: string): NextRequest {
  return {
    cookies: {
      get: (name: string) =>
        cookie && name === SESSION_COOKIE ? { name, value: cookie } : undefined,
    },
  } as unknown as NextRequest;
}

describe("lectura de la sesión", () => {
  it("devuelve el identificador cuando la cookie es válida", () => {
    expect(readSession(request(VALID))).toBe(VALID);
  });

  it("devuelve null cuando no hay cookie", () => {
    expect(readSession(request())).toBeNull();
  });

  it("rechaza una cookie con otro formato", () => {
    expect(readSession(request("no-es-un-uuid"))).toBeNull();
    expect(readSession(request(""))).toBeNull();
  });

  it("rechaza un intento de inyección en el valor", () => {
    expect(readSession(request(`${VALID}' OR '1'='1`))).toBeNull();
    expect(readSession(request("../../etc/passwd"))).toBeNull();
  });

  it("rechaza mayúsculas: emitimos siempre minúsculas", () => {
    expect(readSession(request(VALID.toUpperCase()))).toBeNull();
  });
});

describe("creación de la sesión", () => {
  it("reutiliza la existente y no pide emitir cookie", () => {
    expect(ensureSession(request(VALID))).toEqual({ sessionId: VALID, isNew: false });
  });

  it("crea una nueva cuando no hay", () => {
    const { sessionId, isNew } = ensureSession(request());
    expect(isNew).toBe(true);
    expect(readSession(request(sessionId))).toBe(sessionId);
  });

  it("cada sesión nueva es distinta", () => {
    const ids = new Set(Array.from({ length: 100 }, () => ensureSession(request()).sessionId));
    expect(ids.size).toBe(100);
  });

  it("una cookie manipulada se sustituye por una nueva, no se acepta", () => {
    const { sessionId, isNew } = ensureSession(request("manipulada"));
    expect(isNew).toBe(true);
    expect(sessionId).not.toBe("manipulada");
  });
});

describe("cookie emitida", () => {
  it("es httpOnly: ningún script de la página la necesita", () => {
    const res = attachSession(NextResponse.json({}), VALID);
    expect(res.cookies.get(SESSION_COOKIE)?.httpOnly).toBe(true);
  });

  it("es sameSite lax, para que un enlace compartido siga funcionando", () => {
    const res = attachSession(NextResponse.json({}), VALID);
    expect(res.cookies.get(SESSION_COOKIE)?.sameSite).toBe("lax");
  });

  it("lleva el identificador y caduca", () => {
    const cookie = attachSession(NextResponse.json({}), VALID).cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBe(VALID);
    expect(cookie?.maxAge).toBe(30 * 86_400);
  });

  it("borrarla la vacía y la caduca de inmediato", () => {
    const cookie = clearSession(NextResponse.json({})).cookies.get(SESSION_COOKIE);
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});
