import { NextResponse } from "next/server";
import { isProvider, resolveBrowserProvider } from "@/app/lib/browserProvider";
import { ALL_RULES } from "@/app/lib/rules";

/**
 * Estado real de las tres capas en ESTE despliegue.
 *
 * Existe porque las capas de renderizado e IA son opcionales y degradan en
 * silencio: sin esto no hay forma de saber, mirando el sitio desplegado, si las
 * reglas visuales están corriendo o no. Cualquier afirmación del README sobre
 * producción debe poder comprobarse aquí.
 *
 * No revela secretos: sólo si una credencial está presente, nunca su valor.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const provider = await resolveBrowserProvider();
  const renderingUp = isProvider(provider);

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
  };

  // "degraded" no es un fallo: la aplicación funciona con cualquier subconjunto
  // de capas. Sólo sería "down" si el motor determinista no pudiese correr.
  const status = layers.rules.status === "up" ? "ok" : "down";

  return NextResponse.json(
    { status, layers, timestamp: new Date().toISOString() },
    { status: status === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
