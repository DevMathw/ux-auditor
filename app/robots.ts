import type { MetadataRoute } from "next";
import { SITE_URL } from "./lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Los endpoints de la API no aportan nada a un buscador y cuestan cuota.
      disallow: ["/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
