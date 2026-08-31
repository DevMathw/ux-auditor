import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra el build de producción.
 *
 * Corre sobre `next start`, no sobre `next dev`, porque lo que se quiere
 * verificar sólo existe en producción: la CSP con nonce, el HTML realmente
 * servido y los chunks partidos.
 *
 * Los tests interceptan /api/audit en el navegador. Eso no es pereza: el guard
 * SSRF bloquea 127.0.0.1 a propósito, así que un fixture servido en local no se
 * puede auditar sin abrir un agujero de seguridad para que pasen los tests. Y
 * auditar un sitio real haría el CI dependiente de la red y de la API de pago.
 * Lo que sí se ejerce de verdad es todo lo demás: navegador real, hidratación,
 * CSP, almacenamiento e impresión.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: "http://127.0.0.1:3210",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        /*
         * En local reutiliza el Chrome ya instalado en vez de descargar un
         * navegador entero. En CI no hay Chrome de sistema, así que se deja
         * vacío el canal y Playwright usa el Chromium que instala el workflow.
         */
        ...(process.env.CI ? {} : { channel: "chrome" }),
      },
    },
  ],

  webServer: {
    command: "npx next start -p 3210",
    url: "http://127.0.0.1:3210",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
