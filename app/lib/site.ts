/**
 * Origen público del sitio. Necesario para URLs absolutas en metadatos,
 * sitemap y og:image. En Vercel se puede derivar de VERCEL_PROJECT_PRODUCTION_URL.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const SITE_NAME = "UX Auditor";
