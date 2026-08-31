// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuditForm from "@/app/components/AuditForm";
import type { AuditChecks } from "@/app/lib/types";

/**
 * El formulario es la única entrada del producto. Lo que se prueba aquí es el
 * comportamiento que un usuario percibe: cuándo puede enviar, qué se envía, y
 * qué pasa mientras la auditoría corre.
 */

function setup(over: Partial<React.ComponentProps<typeof AuditForm>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const onLanguageChange = vi.fn();
  render(
    <AuditForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      loading={false}
      language="en"
      onLanguageChange={onLanguageChange}
      {...over}
    />
  );
  return { onSubmit, onCancel, onLanguageChange, user: userEvent.setup() };
}

const urlField = () => screen.getByLabelText(/website url|url del sitio/i);
const submitButton = () => screen.getByRole("button", { name: /run audit|analizar/i });

describe("envío", () => {
  it("el botón está deshabilitado sin URL", () => {
    setup();
    expect(submitButton()).toBeDisabled();
  });

  it("se habilita al escribir una URL", async () => {
    const { user } = setup();
    await user.type(urlField(), "https://example.com");
    expect(submitButton()).toBeEnabled();
  });

  it("envía la URL, las áreas y el idioma", async () => {
    const { onSubmit, user } = setup();
    await user.type(urlField(), "https://example.com");
    await user.click(submitButton());

    expect(onSubmit).toHaveBeenCalledWith(
      "https://example.com",
      { accessibility: true, visualHierarchy: true, uxClarity: true },
      "en"
    );
  });

  it("añade https:// cuando falta el protocolo", async () => {
    const { onSubmit, user } = setup();
    await user.type(urlField(), "example.com");
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledWith("https://example.com", expect.anything(), "en");
  });

  it("respeta un http:// explícito", async () => {
    const { onSubmit, user } = setup();
    await user.type(urlField(), "http://legacy.example.com");
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledWith("http://legacy.example.com", expect.anything(), "en");
  });

  it("recorta los espacios alrededor de la URL", async () => {
    const { onSubmit, user } = setup();
    await user.type(urlField(), "   https://example.com   ");
    await user.click(submitButton());
    expect(onSubmit).toHaveBeenCalledWith("https://example.com", expect.anything(), "en");
  });

  it("se envía con Enter", async () => {
    const { onSubmit, user } = setup();
    await user.type(urlField(), "https://example.com{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("no envía si la URL son solo espacios", async () => {
    const { onSubmit, user } = setup();
    await user.type(urlField(), "     ");
    expect(submitButton()).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("selección de áreas", () => {
  it("las tres empiezan marcadas", () => {
    setup();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeChecked();
  });

  it("desmarcar un área la excluye del envío", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("checkbox", { name: /ux clarity/i }));
    await user.type(urlField(), "https://example.com");
    await user.click(submitButton());

    const checks = onSubmit.mock.calls[0][1] as AuditChecks;
    expect(checks.uxClarity).toBe(false);
    expect(checks.accessibility).toBe(true);
  });

  it("deshabilita el envío si se desmarcan las tres", async () => {
    const { user } = setup();
    await user.type(urlField(), "https://example.com");
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    // Una auditoría de nada no es una respuesta útil.
    expect(submitButton()).toBeDisabled();
  });
});

describe("estado de carga", () => {
  it("muestra Cancelar en lugar de Analizar", () => {
    setup({ loading: true });
    expect(screen.getByRole("button", { name: /cancel|cancelar/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run audit/i })).not.toBeInTheDocument();
  });

  it("cancelar avisa al padre", async () => {
    const { onCancel, user } = setup({ loading: true });
    await user.click(screen.getByRole("button", { name: /cancel|cancelar/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("bloquea los campos mientras carga", () => {
    setup({ loading: true });
    expect(urlField()).toBeDisabled();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });
});

describe("idioma", () => {
  it("renderiza en español", () => {
    setup({ language: "es" });
    expect(screen.getByRole("button", { name: /analizar/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/url del sitio/i)).toBeInTheDocument();
  });

  it("el cambio de idioma avisa al padre", async () => {
    const { onLanguageChange, user } = setup();
    await user.click(screen.getByRole("button", { name: /español/i }));
    expect(onLanguageChange).toHaveBeenCalledWith("es");
  });

  it("marca el idioma activo con aria-pressed", () => {
    setup({ language: "es" });
    expect(screen.getByRole("button", { name: /español/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /english/i })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("accesibilidad", () => {
  it("el campo de URL tiene etiqueta asociada", () => {
    setup();
    expect(urlField()).toHaveAttribute("id", "url-field");
  });

  it("es un formulario real, no un div con un botón", () => {
    // Importa: da envío con Enter y semántica gratis.
    const { container } = render(
      <AuditForm onSubmit={vi.fn()} onCancel={vi.fn()} loading={false} language="en" onLanguageChange={vi.fn()} />
    );
    expect(container.querySelector("form")).toBeInTheDocument();
  });
});
