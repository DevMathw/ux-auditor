// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareButton from "@/app/components/ShareButton";

/**
 * Compartir es un acto explícito y reversible. Lo que estos tests fijan es que
 * el botón no promete un enlace que no existe: si el servidor no lo da, dice
 * que falló en vez de enseñar una URL rota.
 */

const AUDIT_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const SHARE_ID = "a".repeat(22);

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const spy = vi.fn(impl);
  vi.stubGlobal("fetch", spy as unknown as typeof fetch);
  return spy;
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

function mockClipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

beforeEach(() => {
  mockClipboard();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("botón de compartir", () => {
  it("muestra la acción de compartir antes de pulsarla", () => {
    render(<ShareButton auditId={AUDIT_ID} language="en" />);
    expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
  });

  it("publica la auditoría en su propio endpoint", async () => {
    const fetchSpy = mockFetch(() => json({ shareId: SHARE_ID, path: `/a/${SHARE_ID}` }));
    render(<ShareButton auditId={AUDIT_ID} language="en" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(`/api/audits/${AUDIT_ID}/share`);
    expect(init?.method).toBe("POST");
  });

  it("enseña el enlace absoluto para poder copiarlo a mano", async () => {
    mockFetch(() => json({ shareId: SHARE_ID, path: `/a/${SHARE_ID}` }));
    render(<ShareButton auditId={AUDIT_ID} language="en" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    const input = await screen.findByLabelText<HTMLInputElement>("Share");
    expect(input.value).toBe(`${window.location.origin}/a/${SHARE_ID}`);
    expect(input.readOnly).toBe(true);
  });

  it("copia al portapapeles y lo confirma", async () => {
    const writeText = mockClipboard();
    mockFetch(() => json({ shareId: SHARE_ID, path: `/a/${SHARE_ID}` }));
    render(<ShareButton auditId={AUDIT_ID} language="en" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(SHARE_ID)));
    expect(await screen.findByText("Link copied")).toBeTruthy();
  });

  it("si el portapapeles está denegado, el enlace sigue estando", async () => {
    mockClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    mockFetch(() => json({ shareId: SHARE_ID, path: `/a/${SHARE_ID}` }));
    render(<ShareButton auditId={AUDIT_ID} language="en" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    const input = await screen.findByLabelText<HTMLInputElement>("Share");
    expect(input.value).toContain(SHARE_ID);
    expect(screen.queryByText("Link copied")).toBeNull();
  });

  it("un error del servidor se dice, no se disimula con un enlace falso", async () => {
    mockFetch(() => json({ error: "not_found" }, 404));
    render(<ShareButton auditId={AUDIT_ID} language="en" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Could not create the link."
    );
    expect(screen.queryByLabelText("Share")).toBeNull();
  });

  it("un fallo de red también se dice", async () => {
    mockFetch(() => Promise.reject(new Error("offline")));
    render(<ShareButton auditId={AUDIT_ID} language="en" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));

    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("dejar de compartir vuelve al estado inicial", async () => {
    const fetchSpy = mockFetch((_url, init) =>
      init?.method === "DELETE"
        ? json({ shared: false })
        : json({ shareId: SHARE_ID, path: `/a/${SHARE_ID}` })
    );
    render(<ShareButton auditId={AUDIT_ID} language="en" />);

    await userEvent.click(screen.getByRole("button", { name: "Share" }));
    await userEvent.click(await screen.findByRole("button", { name: "Stop sharing" }));

    expect(await screen.findByRole("button", { name: "Share" })).toBeTruthy();
    expect(screen.queryByLabelText("Share")).toBeNull();
    expect(fetchSpy.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("traduce al español", async () => {
    mockFetch(() => json({ shareId: SHARE_ID, path: `/a/${SHARE_ID}` }));
    render(<ShareButton auditId={AUDIT_ID} language="es" />);

    await userEvent.click(screen.getByRole("button", { name: "Compartir" }));

    expect(await screen.findByRole("button", { name: "Dejar de compartir" })).toBeTruthy();
  });
});
