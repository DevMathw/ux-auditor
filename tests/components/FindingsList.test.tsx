// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FindingsList from "@/app/components/FindingsList";
import type { AuditFinding } from "@/app/lib/types";

/**
 * La lista de hallazgos es donde vive el valor del producto. Lo importante:
 * que la evidencia sea alcanzable, que se distinga lo verificado de lo
 * interpretado, y que el orden por severidad se respete.
 */

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: "a11y-h1",
    category: "accessibility",
    severity: "high",
    impact: "high",
    effort: "low",
    title: "No H1 heading",
    description: "The page has no H1.",
    fix: "Add exactly one H1 that names the page's purpose.",
    evidence: [{ selector: "h1", detail: "0 found" }],
    wcag: "1.3.1",
    source: "rule",
    ...over,
  };
}

function setup(findings: AuditFinding[], language: "en" | "es" = "en") {
  render(<FindingsList findings={findings} language={language} />);
  return userEvent.setup();
}

describe("estado vacío", () => {
  it("dice que no hay problemas en vez de mostrar una lista vacía", () => {
    setup([]);
    expect(screen.getByText(/no issues found/i)).toBeInTheDocument();
  });

  it("no muestra la banda de quick wins sin hallazgos", () => {
    setup([]);
    expect(screen.queryByText(/start here/i)).not.toBeInTheDocument();
  });
});

describe("agrupación por severidad", () => {
  it("muestra un grupo por severidad presente", () => {
    setup([
      finding({ id: "a", severity: "critical", title: "Missing page language" }),
      finding({ id: "b", severity: "low", title: "Favicon absent" }),
    ]);
    const headings = screen.getAllByRole("heading").map((h) => h.textContent ?? "");
    expect(headings.some((h) => /critical/i.test(h))).toBe(true);
    expect(headings.some((h) => /low/i.test(h))).toBe(true);
  });

  it("no crea grupos para severidades ausentes", () => {
    setup([finding({ severity: "high" })]);
    expect(screen.queryByRole("heading", { name: /^critical/i })).not.toBeInTheDocument();
  });

  it("lo crítico aparece antes que lo bajo dentro de la lista", () => {
    // Se mide dentro de la tarjeta de hallazgos: la banda de quick wins repite
    // los mismos títulos más arriba y falsearía el índice.
    render(
      <FindingsList
        findings={[
          finding({ id: "low", severity: "low", effort: "high", title: "Low severity item" }),
          finding({ id: "crit", severity: "critical", effort: "high", title: "Critical severity item" }),
        ]}
        language="en"
      />
    );
    const list = screen.getByText(/^Findings$/).closest(".section-card") as HTMLElement;
    const text = list.textContent ?? "";
    expect(text.indexOf("Critical severity item")).toBeLessThan(text.indexOf("Low severity item"));
  });
});

describe("quick wins", () => {
  it("destaca los de alto impacto y bajo esfuerzo", () => {
    setup([finding({ impact: "high", effort: "low", title: "Quick fix here" })]);
    const band = screen.getByText(/start here/i).closest(".section-card")!;
    expect(within(band as HTMLElement).getByText(/quick fix here/i)).toBeInTheDocument();
  });

  it("excluye los de mucho esfuerzo", () => {
    setup([finding({ impact: "high", effort: "high", title: "Big rewrite" })]);
    expect(screen.queryByText(/start here/i)).not.toBeInTheDocument();
  });
});

describe("evidencia y corrección", () => {
  it("empieza plegada", () => {
    setup([finding()]);
    expect(screen.queryByText("0 found")).not.toBeInTheDocument();
  });

  it("se despliega al pulsar y muestra selector y corrección", async () => {
    // effort alto para que no entre en quick wins, que repetiría la corrección.
    const user = setup([finding({ effort: "medium" })]);
    await user.click(screen.getByRole("button", { name: /evidence/i }));

    expect(screen.getByText("h1")).toBeInTheDocument();
    expect(screen.getByText("0 found")).toBeInTheDocument();
    expect(screen.getByText(/add exactly one h1/i)).toBeInTheDocument();
  });

  it("el botón expone su estado con aria-expanded", async () => {
    const user = setup([finding()]);
    const toggle = screen.getByRole("button", { name: /evidence/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });
});

describe("procedencia del hallazgo", () => {
  it("marca los de reglas como verificados", () => {
    setup([finding({ source: "rule" })]);
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it("marca los de IA como interpretación", () => {
    setup([finding({ source: "ai", id: "ai-1" })]);
    expect(screen.getByText(/ai insight/i)).toBeInTheDocument();
  });

  it("muestra la referencia WCAG cuando existe", () => {
    setup([finding({ wcag: "1.4.3" })]);
    expect(screen.getByText("WCAG 1.4.3")).toBeInTheDocument();
  });

  it("omite la referencia WCAG cuando no aplica", () => {
    setup([finding({ wcag: undefined })]);
    expect(screen.queryByText(/^WCAG/)).not.toBeInTheDocument();
  });
});

describe("marcar como resuelto", () => {
  it("alterna el estado del hallazgo", async () => {
    const user = setup([finding()]);
    const button = screen.getByRole("button", { name: /mark resolved/i });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);
    expect(screen.getByRole("button", { name: /resolved/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("resolver uno no afecta a los demás", async () => {
    const user = setup([
      finding({ id: "one", title: "First issue" }),
      finding({ id: "two", title: "Second issue" }),
    ]);
    const buttons = screen.getAllByRole("button", { name: /mark resolved/i });
    await user.click(buttons[0]);

    const after = screen.getAllByRole("button", { name: /mark resolved|resolved/i });
    const pressed = after.filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
  });
});

describe("idioma", () => {
  it("traduce las etiquetas al español", () => {
    setup([finding()], "es");
    expect(screen.getByText(/verificado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /marcar resuelto/i })).toBeInTheDocument();
  });
});

describe("modal de explicación", () => {
  it("no está montado hasta que se pide", () => {
    setup([finding()]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("se abre al pulsar Explain this", async () => {
    // El modal pide la explicación al servidor nada más montarse.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ explanation: "Because…" }), { status: 200 }))
    );
    const user = setup([finding()]);
    await user.click(screen.getByRole("button", { name: /explain this/i }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});
