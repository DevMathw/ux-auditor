import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { createMemoryStore } from "./memory";
import type { Store } from "./types";

/**
 * Resolución del proveedor de almacenamiento.
 *
 * Orden: si hay un directorio donde escribir de verdad, SQLite; si no, memoria.
 * Nunca lanza. Una base de datos que no se puede abrir degrada a memoria y lo
 * dice en /api/health — no tumba la aplicación, igual que el navegador y la IA.
 *
 * Sin configurar nada, quien clone el repositorio obtiene SQLite en `.data/`.
 * Esa es la decisión: la ruta por defecto es la que funciona, no la degradada.
 */

export type { Store, StoreKind, StoredAudit, StoredError, ApiKeyRecord } from "./types";
export { hashKey } from "./memory";

/** Por qué acabamos en memoria, cuando no era lo pedido. */
export type StorageDegradeReason =
  | "forced_memory"
  | "serverless_ephemeral_disk"
  | "sqlite_unavailable"
  | "directory_not_writable";

const DEFAULT_DIR = ".data";
const DB_FILE = "ux-auditor.db";

let store: Store | null = null;
let opening: Promise<Store> | null = null;
let degradeReason: StorageDegradeReason | null = null;

/** Comprueba escritura de verdad: `mkdir` puede pasar y `open` fallar igual. */
function isWritable(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, `.write-probe-${process.pid}`);
    writeFileSync(probe, "");
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

async function resolveStore(): Promise<{ store: Store; reason: StorageDegradeReason | null }> {
  if (process.env.STORAGE_DRIVER === "memory") {
    return { store: createMemoryStore(), reason: "forced_memory" };
  }

  // En Vercel sólo /tmp es escribible, es efímero y es por instancia. Una base
  // de datos ahí daría una falsa sensación de persistencia, así que ni se abre.
  if (process.env.VERCEL) {
    return { store: createMemoryStore(), reason: "serverless_ephemeral_disk" };
  }

  // El caso por defecto se ancla a cwd para que Turbopack pueda trazarlo.
  // Sólo una ruta configurada a mano necesita resolve(), y ahí se le dice
  // explícitamente que no intente seguirla: es un directorio de datos en
  // tiempo de ejecución, no un módulo que haya que empaquetar.
  const configured = process.env.STORAGE_DIR;
  const dir = configured
    ? resolve(/* turbopackIgnore: true */ configured)
    : join(process.cwd(), DEFAULT_DIR);
  if (!isWritable(dir)) {
    return { store: createMemoryStore(), reason: "directory_not_writable" };
  }

  try {
    // Perezoso a propósito: `node:sqlite` no existe antes de Node 22.5, y un
    // import estático rompería el arranque entero en vez de degradar.
    const { createSqliteStore } = await import("./sqlite");
    const file = join(dir, DB_FILE);
    // El nombre, no la ruta absoluta: esto acaba en una respuesta HTTP.
    return { store: createSqliteStore(file, basename(file)), reason: null };
  } catch {
    return { store: createMemoryStore(), reason: "sqlite_unavailable" };
  }
}

/**
 * El store del proceso. Se abre una vez y se reutiliza.
 *
 * La promesa se cachea aparte para que dos peticiones simultáneas durante el
 * arranque no abran dos bases de datos.
 */
export function getStore(): Promise<Store> {
  if (store) return Promise.resolve(store);
  opening ??= resolveStore().then((resolved) => {
    store = resolved.store;
    degradeReason = resolved.reason;
    opening = null;
    return store;
  });
  return opening;
}

/** null cuando el almacenamiento es el que se pidió. */
export async function getStorageDegradeReason(): Promise<StorageDegradeReason | null> {
  await getStore();
  return degradeReason;
}

/** Sólo para los tests: descarta el store del proceso. */
export function resetStore(): void {
  store?.close();
  store = null;
  opening = null;
  degradeReason = null;
}
