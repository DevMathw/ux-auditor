import { NextResponse } from "next/server";
import { isProvider, resolveBrowserProvider } from "@/app/lib/browserProvider";
import { ALL_RULES } from "@/app/lib/rules";
import { getStorageDegradeReason, getStore } from "@/app/lib/storage";

/**
 * Estado real de las cuatro capas en ESTE despliegue.
 *
 * Existe porque las capas de renderizado, IA y almacenamiento son opcionales y
 * degradan en silencio: sin esto no hay forma de saber, mirando el sitio
 * desplegado, si las reglas visuales corren o si los informes persisten.
 * Cualquier afirmación del README sobre producción debe poder comprobarse aquí.
 *
 * No revela secretos: sólo si una credencial está presente, nunca su valor.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = await resolveBrowserProvider();
  const renderingUp = isProvider(provider);
  const store = await getStore();
  const storageReason = await getStorageDegradeReason();

  const layers = {
    rules: {
      status: "up" as const,
      count: ALL_RULES.length,
      // Las reglas visuales sólo se evalúan si hay navegador.
      active: renderingUp
        ? ALL_RULES.length
        : ALL_RULES.filter((r) => !r.id.startsWith("visual-")).length,
    },
    rendering: {
      status: renderingUp ? ("up" as const) : ("degraded" as const),
      // El tipo de proveedor no es un secreto y es lo primero que se pregunta
      // al diagnosticar por qué faltan reglas visuales.
      provider: renderingUp ? (provider as { kind: string }).kind : null,
      reason: renderingUp ? null : provider,
    },
    ai: {
      status: process.env.ANTHROPIC_API_KEY ? ("up" as const) : ("degraded" as const),
      model: "claude-sonnet-5",
    },
    storage: {
      // "degraded" significa que el historial y los enlaces compartidos no
      // sobreviven a un reinicio. La aplicación funciona igual.
      status: store.kind === "sqlite" ? ("up" as const) : ("degraded" as const),
      driver: store.kind,
      // Un nombre de fichero, nunca una ruta absoluta.
      location: store.location,
      reason: storageReason,
      persistent: store.kind === "sqlite",
    },
  };

  // "degraded" no es un fallo: la aplicación funciona con cualquier subconjunto
  // de capas. Sólo sería "down" si el motor determinista no pudiese correr.
  const status = layers.rules.status === "up" ? "ok" : "down";

  return NextResponse.json(
    { status, layers, timestamp: new Date().toISOString() },
    { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
