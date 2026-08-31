import AuditWorkspace from "./components/AuditWorkspace";

/**
 * Server Component: la cabecera es HTML estático y no viaja como JavaScript.
 * Solo el espacio de trabajo interactivo se hidrata en el cliente.
 */
export default function HomePage() {
  return (
    <main className="app">
      <AuditWorkspace />
    </main>
  );
}
