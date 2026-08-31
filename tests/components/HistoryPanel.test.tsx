// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HistoryPanel from "@/app/components/HistoryPanel";
import { getHistory, saveToHistory } from "@/app/lib/history";
import type { AuditResult, HistoryEntry } from "@/app/lib/types";

function audit(score = 50): AuditResult {
  return {
    version: 2,
    overallScore: score,
    scoreBreakdown: { accessibility: null, visualHierarchy: null, uxClarity: null },
    checksPassed: 10,
    checksApplicable: 20,
    confidence: "high",
    confidenceReason: null,
    rendered: false,
    findings: [
      {
        id: "a11y-h1",
        category: "accessibility",
        severity: "high",
        impact: "high",
        effort: "low",
        title: "No H1",
        description: "",
        fix: "",
        evidence: [],
        source: "rule",
      },
    ],
    summary: "",
    quickWins: "",
    strengths: "",
    aiEnabled: false,
  };
}

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: "e1",
    url: "https://example.com/",
    score: 50,
    date: "2026-08-01T10:00:00.000Z",
    language: "en",
    audit: audit(50),
    ...over,
  };
}

function setup(history: HistoryEntry[], language: "en" | "es" = "en") {
  const onSelect = vi.fn();
  const onHistoryChange = vi.fn();
  render(
    <HistoryPanel
      history={history}
      language={language}
      onSelect={onSelect}
      onHistoryChange={onHistoryChange}
    />
  );
  return { onSelect, onHistoryChange, user: userEvent.setup() };
}

describe("estado vacío", () => {
  it("no renderiza nada sin historial", () => {
    const { container } = render(
      <HistoryPanel history={[]} language="en" onSelect={vi.fn()} onHistoryChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("listado", () => {
  it("muestra la URL sin el protocolo y el score", () => {
    setup([entry({ url: "https://example.com/", score: 73 })]);
    expect(screen.getByText("example.com/")).toBeInTheDocument();
    expect(screen.getByText("73")).toBeInTheDocument();
  });

  it("muestra el número de entradas", () => {
    setup([entry({ id: "a" }), entry({ id: "b" })]);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("formatea la fecha con el locale del idioma activo", () => {
    const { container } = render(
      <HistoryPanel
        history={[entry({ date: "2026-08-01T10:00:00.000Z" })]}
        language="es"
        onSelect={vi.fn()}
        onHistoryChange={vi.fn()}
      />
    );
    // El formato exacto lo decide ICU; sólo se comprueba que se formatee algo
    // con día y hora en vez de volcar el ISO crudo.
    const dateEl = container.querySelector('[style*="font-mono"], .section-card div')!;
    const text = container.textContent ?? "";
    expect(text).not.toContain("2026-08-01T10:00:00.000Z");
    expect(text).toMatch(/\d{1,2}/);
    expect(dateEl).toBeTruthy();
  });
});

describe("cargar una auditoría", () => {
  it("devuelve la entrada completa al padre", async () => {
    const target = entry({ id: "target", score: 88 });
    const { onSelect, user } = setup([target]);
    await user.click(screen.getByRole("button", { name: /^load$/i }));
    expect(onSelect).toHaveBeenCalledWith(target);
  });
});

describe("borrado", () => {
  it("el botón de eliminar tiene nombre accesible con la URL", () => {
    setup([entry({ url: "https://example.com/" })]);
    expect(
      screen.getByRole("button", { name: /delete entry: https:\/\/example\.com\//i })
    ).toBeInTheDocument();
  });

  it("eliminar una entrada avisa al padre", async () => {
    const { onHistoryChange, user } = setup([entry()]);
    await user.click(screen.getByRole("button", { name: /delete entry/i }));
    expect(onHistoryChange).toHaveBeenCalled();
  });

  it("limpiar todo avisa al padre", async () => {
    const { onHistoryChange, user } = setup([entry()]);
    await user.click(screen.getByRole("button", { name: /clear all/i }));
    expect(onHistoryChange).toHaveBeenCalled();
  });

  it("eliminar quita la entrada del almacenamiento", async () => {
    saveToHistory(entry({ id: "keep", url: "https://keep.test/" }));
    saveToHistory(entry({ id: "drop", url: "https://drop.test/" }));

    const { user } = setup(getHistory());
    await user.click(screen.getByRole("button", { name: /delete entry: https:\/\/drop\.test\//i }));

    expect(getHistory().map((e) => e.id)).toEqual(["keep"]);
  });
});

describe("historial corrupto", () => {
  it("descarta entradas inválidas en lugar de reventar", () => {
    localStorage.setItem(
      "ux-auditor-history",
      JSON.stringify([
        entry({ id: "valid" }),
        { id: "sin-url" },
        { id: "fecha-mala", url: "https://x.test/", date: "no-es-fecha", audit: {} },
        "no-es-un-objeto",
        null,
      ])
    );

    const recovered = getHistory();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).toBe("valid");

    // Y el panel renderiza con lo que sobrevivió.
    expect(() => setup(recovered)).not.toThrow();
  });

  it("un JSON ilegible devuelve historial vacío", () => {
    localStorage.setItem("ux-auditor-history", "{roto");
    expect(getHistory()).toEqual([]);
  });

  it("descarta informes de un formato anterior", () => {
    // version !== 2 significa que el esquema cambió: mejor perder la entrada
    // que renderizar campos que ya no existen.
    localStorage.setItem(
      "ux-auditor-history",
      JSON.stringify([{ ...entry(), audit: { ...audit(), version: 1 } }])
    );
    expect(getHistory()).toEqual([]);
  });
});

describe("idioma", () => {
  it("traduce las acciones al español", () => {
    setup([entry()], "es");
    expect(screen.getByRole("button", { name: /^cargar$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /limpiar todo/i })).toBeInTheDocument();
  });
});
