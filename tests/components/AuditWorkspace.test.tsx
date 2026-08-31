// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuditWorkspace from "@/app/components/AuditWorkspace";
import type { AuditResult } from "@/app/lib/types";

/**
 * El orquestador de la interfaz. Lo que importa aquí son las transiciones de
 * estado que un usuario percibe — ocioso, cargando, resultado, error — y que
 * cancelar realmente aborte la petición en vuelo.
 */

function audit(over: Partial<AuditResult> = {}): AuditResult {
  return {
    version: 2,
    overallScore: 62,
    scoreBreakdown: {
      accessibility: { score: 60, rulesApplicable: 12, rulesPassed: 8 },
      visualHierarchy: { score: 70, rulesApplicable: 4, rulesPassed: 3 },
      uxClarity: null,
    },
    checksPassed: 11,
    checksApplicable: 16,
    confidence: "high",
    confidenceReason: null,
    rendered: true,
    findings: [
      {
        id: "a11y-h1",
        category: "accessibility",
        severity: "high",
        impact: "high",
        effort: "medium",
        title: "No H1 heading",
        description: "The page has no H1.",
        fix: "Add exactly one H1.",
        evidence: [{ selector: "h1", detail: "0 found" }],
        source: "rule",
      },
    ],
    summary: "This page needs work.",
    quickWins: "",
    strengths: "",
    aiEnabled: true,
    ...over,
  };
}

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(error: string, status = 400) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Mock de fetch tipado, para poder leer el cuerpo enviado sin castear. */
function mockFetch(handler: () => Promise<Response>) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return handler();
  };
  vi.stubGlobal("fetch", vi.fn(impl));
  return calls;
}

async function runAuditFromUI(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/website url/i), "https://example.com");
  await user.click(screen.getByRole("button", { name: /run audit/i }));
}

beforeEach(() => {
  localStorage.clear();
});

describe("estado inicial", () => {
  it("muestra el formulario y qué obtienes", () => {
    render(<AuditWorkspace />);
    expect(screen.getByLabelText(/website url/i)).toBeInTheDocument();
    expect(screen.getByText(/what you get/i)).toBeInTheDocument();
  });

  it("no muestra el estado vacío si ya hay historial", () => {
    localStorage.setItem(
      "ux-auditor-history",
      JSON.stringify([
        {
          id: "e1",
          url: "https://example.com/",
          score: 50,
          date: new Date().toISOString(),
          language: "en",
          audit: audit(),
        },
      ])
    );
    render(<AuditWorkspace />);
    expect(screen.queryByText(/what you get/i)).not.toBeInTheDocument();
  });
});

describe("auditoría con éxito", () => {
  it("pasa por cargando y llega al informe", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => { resolve = r; })));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);

    // Cargando: aparece el status y el botón cambia a Cancelar.
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();

    resolve(okResponse({ audit: audit(), analyzedUrl: "https://example.com/", cached: false }));

    expect(await screen.findByText("62")).toBeInTheDocument();
    expect(screen.getByText(/11 of 16 checks passed/i)).toBeInTheDocument();
    expect(screen.getByText(/this page needs work/i)).toBeInTheDocument();
  });

  it("envía la URL normalizada al servidor", async () => {
    const calls = mockFetch(async () =>
      okResponse({ audit: audit(), analyzedUrl: "https://example.com/", cached: false })
    );

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await user.type(screen.getByLabelText(/website url/i), "example.com");
    await user.click(screen.getByRole("button", { name: /run audit/i }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.url).toBe("https://example.com");
  });

  it("guarda el resultado en el historial", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      okResponse({ audit: audit(), analyzedUrl: "https://example.com/", cached: false })
    ));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);
    await screen.findByText("62");

    const stored = JSON.parse(localStorage.getItem("ux-auditor-history") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].url).toBe("https://example.com/");
  });

  it("avisa cuando el informe viene de caché", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      okResponse({ audit: audit(), analyzedUrl: "https://example.com/", cached: true })
    ));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);
    expect(await screen.findByText(/loaded from cache/i)).toBeInTheDocument();
  });

  it("avisa cuando faltó la capa de renderizado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      okResponse({ audit: audit({ rendered: false }), analyzedUrl: "https://example.com/", cached: false })
    ));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);
    expect(await screen.findByText(/markup-only audit/i)).toBeInTheDocument();
  });

  it("avisa de baja confianza de forma destacada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      okResponse({
        audit: audit({ confidence: "low", confidenceReason: "thin_content" }),
        analyzedUrl: "https://example.com/",
        cached: false,
      })
    ));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/low confidence/i);
  });
});

describe("errores", () => {
  it("traduce el código de error del servidor a un mensaje", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse("fetch_blocked", 400)));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/only public websites are allowed/i);
  });

  it("muestra un mensaje de red si el fetch falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the server/i);
  });

  it("un código desconocido cae en el mensaje genérico", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => errorResponse("something_new", 500)));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(/analysis failed/i);
  });

  it("tras un error se puede reintentar", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse("fetch_unreachable", 422))
      .mockResolvedValueOnce(okResponse({ audit: audit(), analyzedUrl: "https://example.com/", cached: false }));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: /run audit/i }));
    expect(await screen.findByText("62")).toBeInTheDocument();
  });
});

describe("cancelación", () => {
  it("aborta la petición en vuelo", async () => {
    let capturedSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => {
        capturedSignal = init.signal ?? undefined;
        return new Promise<Response>((_, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        });
      })
    );

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);

    await screen.findByRole("status");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(capturedSignal?.aborted).toBe(true);
    // Vuelve a ocioso sin mostrar el aborto como si fuese un fallo.
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("idioma", () => {
  it("cambia toda la interfaz y lo recuerda", async () => {
    const user = userEvent.setup();
    render(<AuditWorkspace />);

    await user.click(screen.getByRole("button", { name: /español/i }));
    expect(screen.getByRole("button", { name: /analizar/i })).toBeInTheDocument();
    expect(localStorage.getItem("ux-auditor-language")).toBe("es");
  });

  it("aplica el idioma guardado al montar", () => {
    localStorage.setItem("ux-auditor-language", "es");
    render(<AuditWorkspace />);
    expect(screen.getByRole("button", { name: /analizar/i })).toBeInTheDocument();
  });

  it("mantiene el atributo lang del documento sincronizado", async () => {
    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await user.click(screen.getByRole("button", { name: /español/i }));
    await waitFor(() => expect(document.documentElement.lang).toBe("es"));
  });

  it("envía el idioma elegido al servidor", async () => {
    const calls = mockFetch(async () =>
      okResponse({ audit: audit(), analyzedUrl: "https://example.com/", cached: false })
    );

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await user.click(screen.getByRole("button", { name: /español/i }));
    await user.type(screen.getByLabelText(/url del sitio/i), "https://example.com");
    await user.click(screen.getByRole("button", { name: /analizar/i }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.language).toBe("es");
  });
});

describe("reinicio", () => {
  it("vuelve al formulario vacío", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      okResponse({ audit: audit(), analyzedUrl: "https://example.com/", cached: false })
    ));

    const user = userEvent.setup();
    render(<AuditWorkspace />);
    await runAuditFromUI(user);
    await screen.findByText("62");

    await user.click(screen.getByRole("button", { name: /run another audit/i }));

    // El campo se vacía: dejar la URL anterior confunde.
    expect(screen.getByLabelText(/website url/i)).toHaveValue("");
    // El informe desaparece, pero el score sigue visible en el historial —
    // que es justo lo que debe pasar: la auditoría quedó guardada.
    expect(screen.queryByText(/this page needs work/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/11 of 16 checks passed/i)).not.toBeInTheDocument();
    expect(screen.getByText(/^History$/)).toBeInTheDocument();
  });
});
