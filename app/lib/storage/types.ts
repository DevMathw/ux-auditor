import type { AuditResult } from "../types";

/**
 * Contrato de almacenamiento.
 *
 * Cuarta capa opcional del proyecto, con la misma forma que las otras tres:
 * si no hay dónde escribir, se usa memoria y la aplicación sigue funcionando —
 * sólo pierde el historial entre reinicios y los enlaces compartibles.
 *
 * Se divide por repositorios en vez de exponer un KV genérico: cada uno tiene
 * su propia forma y sus propias reglas de retención, y un `get(key)` suelto las
 * escondería.
 */

export type StoreKind = "memory" | "sqlite";

/**
 * PRIVACIDAD — qué se guarda y qué no.
 *
 * SE GUARDA:
 *  - La URL auditada. Es imprescindible: un informe sin saber de qué página
 *    habla no significa nada.
 *  - El informe, incluidos los fragmentos de evidencia. Son la razón de ser
 *    del producto y ya son públicos: vienen de una página pública.
 *  - Un identificador de sesión anónimo y aleatorio, para que alguien pueda
 *    ver y borrar lo suyo sin tener cuenta.
 *
 * NO SE GUARDA:
 *  - El HTML descargado ni la captura. Pesan y no hacen falta después.
 *  - Direcciones IP ni user agent. No se necesitan para nada del producto.
 *  - Nada que identifique a una persona.
 */
export interface StoredAudit {
  id: string;
  /** Identificador de sesión anónimo del creador. */
  sessionId: string;
  url: string;
  score: number;
  language: "en" | "es";
  createdAt: string;
  audit: AuditResult;
  /** Presente sólo si se ha compartido. Distinto del id para no filtrarlo. */
  shareId: string | null;
}

export interface AuditRepository {
  save(audit: Omit<StoredAudit, "id" | "shareId">): StoredAudit;
  /** Historial de una sesión, más reciente primero. */
  listBySession(sessionId: string, limit?: number): StoredAudit[];
  findById(id: string, sessionId: string): StoredAudit | null;
  /** Un enlace compartido no exige sesión: quien tiene el enlace puede verlo. */
  findByShareId(shareId: string): StoredAudit | null;
  /** Genera el enlace compartible. Devuelve null si la auditoría no es suya. */
  share(id: string, sessionId: string): string | null;
  unshare(id: string, sessionId: string): boolean;
  delete(id: string, sessionId: string): boolean;
  /** Borrado completo de la sesión: es el derecho a borrar sus datos. */
  deleteSession(sessionId: string): number;
  /** Retención: descarta lo más viejo que la ventana configurada. */
  pruneOlderThan(days: number): number;
}

export interface ApiKeyRecord {
  id: string;
  /** Hash SHA-256. La clave en claro sólo existe una vez, al crearla. */
  keyHash: string;
  label: string;
  createdAt: string;
  revokedAt: string | null;
  /** Auditorías permitidas por ventana. */
  quota: number;
  used: number;
  /** Inicio de la ventana de cuota actual. */
  windowStartedAt: string;
}

export interface ApiKeyRepository {
  /** Crea la clave y devuelve el secreto en claro UNA sola vez. */
  create(label: string, quota: number): { record: ApiKeyRecord; secret: string };
  findByHash(keyHash: string): ApiKeyRecord | null;
  /** Consume una unidad de cuota. false si está agotada o revocada. */
  consume(id: string, windowMs: number): boolean;
  revoke(id: string): boolean;
  list(): ApiKeyRecord[];
}

export interface StoredError {
  id: string;
  event: string;
  message: string;
  createdAt: string;
}

export interface ErrorRepository {
  /** Anillo acotado: los errores viejos se descartan solos. */
  record(event: string, message: string): void;
  recent(limit?: number): StoredError[];
  clear(): void;
}

export interface CacheRepository {
  get(key: string): AuditResult | null;
  set(key: string, value: AuditResult, ttlMs: number): void;
}

export interface Store {
  kind: StoreKind;
  /** Dónde vive, para poder decirlo en /api/health. Nunca una ruta absoluta. */
  location: string;
  audits: AuditRepository;
  apiKeys: ApiKeyRepository;
  errors: ErrorRepository;
  cache: CacheRepository;
  close(): void;
}
