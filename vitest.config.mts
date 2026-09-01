import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
  test: {
    // El dominio corre en node; los componentes necesitan DOM. Se elige por
    // fichero con `@vitest-environment jsdom` para no pagar jsdom en todo.
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    // Los .spec.ts de e2e los corre Playwright, no vitest.
    exclude: ["e2e/**", "node_modules/**"],
    setupFiles: ["tests/setup/dom.ts"],
    env: {
      // Los tests nunca tocan disco: si no, dejarían una base de datos en el
      // repositorio y su resultado dependería de lo que quedase de la anterior.
      STORAGE_DRIVER: "memory",
    },
    // Los tests de componentes con jsdom + userEvent son sensibles al tiempo y
    // el runner de CI puede ir cargado. 5 s por defecto producía fallos
    // intermitentes; 15 s no ralentiza los que pasan.
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
