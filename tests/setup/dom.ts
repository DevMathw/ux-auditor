import { afterEach, vi } from "vitest";

/**
 * Preparación común de los tests de componentes.
 *
 * El mismo setup corre para los tests de dominio (entorno node) y los de
 * componentes (jsdom), así que todo lo que toca el DOM va detrás de una guarda.
 * jsdom no implementa varias APIs que la interfaz usa de verdad; se suplen aquí
 * en lugar de repetirlas en cada test.
 */
const hasDom = typeof window !== "undefined";

if (hasDom) {
  await import("@testing-library/jest-dom/vitest");

  // El informe hace scroll al cargarse desde el historial.
  window.scrollTo = vi.fn();

  // La exportación PDF abre una ventana de impresión y las de JSON/Markdown
  // crean un blob URL. jsdom no implementa ninguna de las dos.
  window.URL.createObjectURL ??= vi.fn(() => "blob:mock");
  window.URL.revokeObjectURL ??= vi.fn();
}

afterEach(async () => {
  if (hasDom) {
    const { cleanup } = await import("@testing-library/react");
    cleanup();
    localStorage.clear();
  }
  vi.restoreAllMocks();
});
