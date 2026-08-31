import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

/**
 * 404 propia. La de Next por defecto es una línea de texto sin estilo, que en
 * un producto que audita claridad de UX queda especialmente mal.
 */
export default function NotFound() {
  return (
    <main className="app">
      <header className="header">
        <div className="eyebrow">
          <span className="dot" /> 404
        </div>
        <h1>
          Nothing <em>here</em>
        </h1>
        <p className="subtitle">
          That page doesn&rsquo;t exist. It may have moved, or the link may have
          been mistyped.
        </p>
      </header>

      <div className="section-card">
        <div className="section-title">Where to go</div>
        <ul className="empty-bullets">
          <li>
            <Link href="/">Run an audit</Link> — paste any URL and get a report
          </li>
          <li>
            <Link href="/scoring">How scoring works</Link> — the 27 checks and
            what each one measures
          </li>
        </ul>
      </div>
    </main>
  );
}
