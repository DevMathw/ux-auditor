import type { Metadata } from "next";
import { DM_Mono, Fraunces } from "next/font/google";
import { SITE_NAME, SITE_URL } from "./lib/site";
import "./globals.css";

// next/font auto-hospeda las fuentes en build: sin @import bloqueante y sin
// peticiones a Google en tiempo de ejecución. Solo los pesos que se usan.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display-loaded",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
  variable: "--font-mono-loaded",
});

const description =
  "27 automated accessibility, hierarchy and clarity checks with the evidence behind each one, measured on the rendered page, plus an AI that reviews the design.";

/**
 * Renderizado dinámico para TODAS las páginas.
 *
 * El nonce de CSP se genera por petición en proxy.ts, y Next sólo puede
 * inyectarlo en el HTML si éste también se genera por petición. Una página
 * prerenderizada serviría scripts inline sin nonce que la propia CSP bloquearía
 * — la app quedaría rota en producción. Va en el layout y no en cada página
 * para que añadir una ruta nueva no reintroduzca el fallo por olvido.
 *
 * Coste medido: TTFB de 12 ms a 21 ms. FCP y LCP sin cambios.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — Verifiable UX audits for any URL`,
    template: `%s · ${SITE_NAME}`,
  },
  description,
  applicationName: SITE_NAME,
  keywords: [
    "UX audit",
    "accessibility checker",
    "WCAG",
    "visual hierarchy",
    "UX review",
    "website analysis",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Verifiable UX audits for any URL`,
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Verifiable UX audits for any URL`,
    description,
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // El idioma real lo ajusta el cliente al cambiar de idioma en la interfaz.
    <html lang="en" className={`${fraunces.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
