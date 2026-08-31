// next.config.ts
import type { NextConfig } from "next";

/**
 * La Content-Security-Policy NO está aquí: se emite en proxy.ts, que genera un
 * nonce por petición. Estas cabeceras sí son estáticas y se aplican a todo,
 * incluidas las rutas de API que el proxy no intercepta.
 */
const nextConfig: NextConfig = {
  // No anunciar la tecnología del servidor.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
