// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ExportButton from "@/app/components/ExportButton";
import type { AuditFinding, AuditResult } from "@/app/lib/types";

function finding(over: Partial<AuditFinding> = {}): AuditFinding {
  return {
    id: "a11y-h1",
    category: "accessibility",
    severity: "high",
    impact: "high",
    effort: "medium",
    title: "No H1 heading",
    description: "The page has no H1.",
    fix: "Add exactly one H1.",
    evidence: [{ selector: "h1", detail: "0 found" }],
    wcag: "1.3.1",
    source: "rule",
    ...over,
  };
}

function audit(over: Partial<AuditResult> = {}): AuditResult {
  return {
    version: 2,
    overallScore: 62,
    scoreBreakdown: {
      accessibility: { score: 60, rulesApplicable: 12, rulesPassed: 8 },
      visualHierarchy: null,
      uxClarity: null,
    },
    checksPassed: 8,
    checksApplicable: 12,
    confidence: "high",
    confidenceReason: null,
    rendered: true,
    findings: [finding()],
    summary: "A summary.",
    quickWins: "",
    strengths: "Clear headline.",
    aiEnabled: true,
    ...over,
  };
}

/** Captura lo que se descarga sin escribir en disco. */
function captureDownloads() {
  const captured: { filename: string; type: string; blob: Blob }[] = [];
  const createObjectURL = vi
    .spyOn(URL, "createObjectURL")
    .mockImplementation(() => "blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const blob = createObjectURL.mock.calls.at(-1)?.[0] as Blob;
    captured.push({ filename: this.download, type: blob?.type ?? "", blob });
  };

  return {
    captured,
    restore: () => {
      HTMLAnchorElement.prototype.click = realClick;
    },
  };
}

function setup(over: Partial<AuditResult> = {}, language: "en" | "es" = "en") {
  render(<ExportButton audit={audit(over)} url="https://example.com/" language={language} />);
  return userEvent.setup();
}

describe("controles", () => {
  it("ofrece los tres formatos", () => {
    setup();
    expect(screen.getByRole("button", { name: /pdf/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /json/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /markdown/i })).toBeInTheDocument();
  });

  it("el grupo tiene nombre accesible", () => {
    setup();
    expect(screen.getByRole("group", { name: /export report/i })).toBeInTheDocument();
  });

  it("traduce el grupo al español", () => {
    setup({}, "es");
    expect(screen.getByRole("group", { name: /exportar informe/i })).toBeInTheDocument();
  });
});

describe("exportación JSON", () => {
  it("descarga un JSON válido con el informe completo", async () => {
    const { captured, restore } = captureDownloads();
    const user = setup();

    await user.click(screen.getByRole("button", { name: /json/i }));
    const file = captured.at(-1)!;
    const text = await file.blob.text();
    restore();

    expect(file.filename).toMatch(/^ux-audit-example\.com-\d{4}-\d{2}-\d{2}\.json$/);
    expect(file.type).toContain("application/json");

    const parsed = JSON.parse(text);
    expect(parsed.format).toBe("ux-auditor-report@1");
    expect(parsed.audit.overallScore).toBe(62);
    expect(parsed.audit.findings[0].evidence).toHaveLength(1);
  });
});

describe("exportación Markdown", () => {
  it("descarga un Markdown legible", async () => {
    const { captured, restore } = captureDownloads();
    const user = setup();

    await user.click(screen.getByRole("button", { name: /markdown/i }));
    const file = captured.at(-1)!;
    const text = await file.blob.text();
    restore();

    expect(file.filename).toMatch(/\.md$/);
    expect(file.type).toContain("text/markdown");
    expect(text).toContain("# UX Audit — https://example.com/");
    expect(text).toContain("**Score: 62/100**");
    expect(text).toContain("**Fix:** Add exactly one H1.");
  });
});

describe("exportación PDF", () => {
  it("crea un iframe aislado y lanza la impresión", async () => {
    const print = vi.fn();
    const user = setup();

    // El componente imprime en el onload del iframe; jsdom no lo dispara solo.
    const appended: HTMLIFrameElement[] = [];
    const realAppend = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLIFrameElement) {
        appended.push(node);
        Object.defineProperty(node, "contentWindow", {
          value: { focus: vi.fn(), print },
          configurable: true,
        });
        node.onload?.(new Event("load"));
        return node;
      }
      return realAppend(node);
    });

    await user.click(screen.getByRole("button", { name: /pdf/i }));

    expect(appended).toHaveLength(1);
    expect(print).toHaveBeenCalledTimes(1);
    // No se usa window.open: lo bloquearía el navegador.
    expect(appended[0].getAttribute("aria-hidden")).toBe("true");
  });

  it("el documento del PDF lleva su propia CSP y escapa el contenido", async () => {
    const user = setup({
      findings: [finding({ title: '<img src=x onerror="alert(1)">', description: "<script>bad()</script>" })],
    });

    let srcdoc = "";
    const realAppend = document.body.appendChild.bind(document.body);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLIFrameElement) {
        srcdoc = node.srcdoc;
        Object.defineProperty(node, "contentWindow", {
          value: { focus: vi.fn(), print: vi.fn() },
          configurable: true,
        });
        node.onload?.(new Event("load"));
        return node;
      }
      return realAppend(node);
    });

    await user.click(screen.getByRole("button", { name: /pdf/i }));

    // El informe viene de una web ajena y del modelo: nada debe ejecutarse.
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).not.toContain("<script>bad()</script>");
    expect(srcdoc).not.toMatch(/<img src=x onerror=/);
    expect(srcdoc).toContain("&lt;img src=x");
  });
});
