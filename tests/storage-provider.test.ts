import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStorageDegradeReason, getStore, resetStore } from "@/app/lib/storage";

/**
 * El proveedor decide en qué acaba corriendo el almacenamiento. Lo que importa
 * de él es que NUNCA lance: un fallo de disco tiene que degradar a memoria y
 * decirlo, igual que hacen el navegador y la IA.
 */

const tempDirs: string[] = [];
const originalEnv = { ...process.env };

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "uxa-prov-"));
  tempDirs.push(dir);
  return dir;
}

beforeEach(() => {
  resetStore();
  delete process.env.STORAGE_DRIVER;
  delete process.env.STORAGE_DIR;
  delete process.env.VERCEL;
});

afterEach(() => {
  resetStore();
  process.env = { ...originalEnv };
});

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("resolución del proveedor", () => {
  it("con un directorio escribible usa sqlite", async () => {
    process.env.STORAGE_DIR = tempDir();
    const store = await getStore();
    expect(store.kind).toBe("sqlite");
    expect(await getStorageDegradeReason()).toBeNull();
  });

  it("crea el directorio si no existe", async () => {
    process.env.STORAGE_DIR = join(tempDir(), "anidado", "mas-adentro");
    expect((await getStore()).kind).toBe("sqlite");
  });

  it("STORAGE_DRIVER=memory fuerza memoria y lo dice", async () => {
    process.env.STORAGE_DRIVER = "memory";
    process.env.STORAGE_DIR = tempDir();
    expect((await getStore()).kind).toBe("memory");
    expect(await getStorageDegradeReason()).toBe("forced_memory");
  });

  it("en Vercel usa memoria: allí el disco es efímero y por instancia", async () => {
    process.env.VERCEL = "1";
    process.env.STORAGE_DIR = tempDir();
    expect((await getStore()).kind).toBe("memory");
    expect(await getStorageDegradeReason()).toBe("serverless_ephemeral_disk");
  });

  it("un directorio imposible degrada a memoria en vez de lanzar", async () => {
    // Se apunta STORAGE_DIR a un fichero: mkdir no puede convertirlo en
    // directorio, así que la comprobación de escritura falla de verdad.
    const ocupado = join(tempDir(), "esto-es-un-fichero");
    writeFileSync(ocupado, "no soy un directorio");
    process.env.STORAGE_DIR = ocupado;

    const store = await getStore();
    expect(store.kind).toBe("memory");
    expect(await getStorageDegradeReason()).toBe("directory_not_writable");
  });

  it("reutiliza el mismo store entre llamadas", async () => {
    process.env.STORAGE_DIR = tempDir();
    expect(await getStore()).toBe(await getStore());
  });

  it("dos llamadas simultáneas abren una sola base de datos", async () => {
    process.env.STORAGE_DIR = tempDir();
    const [a, b, c] = await Promise.all([getStore(), getStore(), getStore()]);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("lo guardado sigue ahí mientras el store viva", async () => {
    process.env.STORAGE_DIR = tempDir();
    const store = await getStore();
    store.errors.record("prueba", "sigue vivo");
    expect((await getStore()).errors.recent()[0].message).toBe("sigue vivo");
  });
});
