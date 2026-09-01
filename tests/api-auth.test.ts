import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { authenticateKey, quotaResetSeconds } from "@/app/lib/apiKeys";
import { denyOperator } from "@/app/lib/operatorAuth";
import { getStore, resetStore } from "@/app/lib/storage";

/**
 * Dos puertas distintas y deliberadamente separadas: la clave de API, que
 * identifica a quien consume el servicio, y ADMIN_TOKEN, que identifica a quien
 * lo opera. Una clave de API jamás debe abrir /api/keys.
 */

function request(headers: Record<string, string> = {}): NextRequest {
  return { headers: new Headers(headers) } as unknown as NextRequest;
}

beforeEach(() => {
  process.env.STORAGE_DRIVER = "memory";
  resetStore();
});

afterEach(() => {
  delete process.env.ADMIN_TOKEN;
  resetStore();
});

describe("clave de API", () => {
  it("sin cabecera es anónimo: la aplicación funciona igual", async () => {
    expect((await authenticateKey(request())).status).toBe("anonymous");
  });

  it("acepta la clave en x-api-key", async () => {
    const store = await getStore();
    const { secret } = store.apiKeys.create("cli", 10);
    expect((await authenticateKey(request({ "x-api-key": secret }))).status).toBe("ok");
  });

  it("acepta la clave como Bearer", async () => {
    const store = await getStore();
    const { secret } = store.apiKeys.create("cli", 10);
    const auth = await authenticateKey(request({ authorization: `Bearer ${secret}` }));
    expect(auth.status).toBe("ok");
  });

  it("una clave con forma correcta pero inexistente es inválida", async () => {
    const inventada = `uxa_${"a".repeat(40)}`;
    expect((await authenticateKey(request({ "x-api-key": inventada }))).status).toBe("invalid");
  });

  it("una cabecera con otra forma es inválida", async () => {
    expect((await authenticateKey(request({ "x-api-key": "basura" }))).status).toBe("invalid");
  });

  it("una clave revocada se rechaza como tal, no como inválida", async () => {
    const store = await getStore();
    const { record, secret } = store.apiKeys.create("cli", 10);
    store.apiKeys.revoke(record.id);
    expect((await authenticateKey(request({ "x-api-key": secret }))).status).toBe("revoked");
  });

  it("cada petición consume cuota, y al agotarse se rechaza", async () => {
    const store = await getStore();
    const { secret } = store.apiKeys.create("cli", 2);
    expect((await authenticateKey(request({ "x-api-key": secret }))).status).toBe("ok");
    expect((await authenticateKey(request({ "x-api-key": secret }))).status).toBe("ok");
    expect((await authenticateKey(request({ "x-api-key": secret }))).status).toBe("quota_exceeded");
  });

  it("el rechazo por cuota dice cuándo reintentar", async () => {
    const store = await getStore();
    const { secret } = store.apiKeys.create("cli", 1);
    await authenticateKey(request({ "x-api-key": secret }));
    const auth = await authenticateKey(request({ "x-api-key": secret }));
    if (auth.status !== "quota_exceeded") throw new Error("se esperaba cuota agotada");
    const segundos = quotaResetSeconds(auth.record);
    expect(segundos).toBeGreaterThan(0);
    expect(segundos).toBeLessThanOrEqual(24 * 3600);
  });

  it("la cuota de una clave no gasta la de otra", async () => {
    const store = await getStore();
    const a = store.apiKeys.create("a", 1);
    const b = store.apiKeys.create("b", 1);
    await authenticateKey(request({ "x-api-key": a.secret }));
    expect((await authenticateKey(request({ "x-api-key": a.secret }))).status).toBe("quota_exceeded");
    expect((await authenticateKey(request({ "x-api-key": b.secret }))).status).toBe("ok");
  });
});

describe("token de operación", () => {
  it("sin ADMIN_TOKEN el endpoint no existe", () => {
    const res = denyOperator(request({ authorization: "Bearer lo-que-sea" }));
    expect(res?.status).toBe(404);
  });

  it("con token configurado, sin cabecera es 401", () => {
    process.env.ADMIN_TOKEN = "secreto-de-operacion";
    expect(denyOperator(request())?.status).toBe(401);
  });

  it("un token incorrecto es 401", () => {
    process.env.ADMIN_TOKEN = "secreto-de-operacion";
    expect(denyOperator(request({ authorization: "Bearer otro" }))?.status).toBe(401);
  });

  it("un prefijo correcto del token no basta", () => {
    process.env.ADMIN_TOKEN = "secreto-de-operacion";
    expect(denyOperator(request({ authorization: "Bearer secreto" }))?.status).toBe(401);
  });

  it("el token correcto deja pasar", () => {
    process.env.ADMIN_TOKEN = "secreto-de-operacion";
    expect(denyOperator(request({ authorization: "Bearer secreto-de-operacion" }))).toBeNull();
  });

  it("una clave de API válida no abre los endpoints de operación", async () => {
    process.env.ADMIN_TOKEN = "secreto-de-operacion";
    const store = await getStore();
    const { secret } = store.apiKeys.create("cli", 10);
    expect(denyOperator(request({ authorization: `Bearer ${secret}` }))?.status).toBe(401);
  });
});
