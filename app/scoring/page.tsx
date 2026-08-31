import type { Metadata } from "next";
import Link from "next/link";
import { ALL_RULES } from "@/app/lib/rules";
import { RULE_DOCS } from "@/app/lib/rules/docs";
import type { RuleCategory } from "@/app/lib/rules/types";

/**
 * Página pública "How scoring works".
 *
 * Se genera enteramente a partir de ALL_RULES y RULE_DOCS: no hay ninguna lista
 * escrita a mano, así que no puede quedarse desactualizada respecto al motor.
 * Un test comprueba que toda regla tenga documentación.
 */

export const metadata: Metadata = {
  title: "How scoring works",
  description:
    "The 27 deterministic checks behind a UX Auditor score: what each one measures, when it applies, its penalty, and what it deliberately does not detect.",
  alternates: { canonical: "/scoring" },
};

const CATEGORY_LABEL: Record<RuleCategory, string> = {
  accessibility: "Accessibility",
  hierarchy: "Visual hierarchy",
  clarity: "UX clarity",
};

const CATEGORY_INTRO: Record<RuleCategory, string> = {
  accessibility:
    "Whether the page can be used by someone relying on a screen reader, a keyboard, or zoom.",
  hierarchy:
    "Whether the page's structure lets someone scan it and find what they came for.",
  clarity:
    "Whether the page says what it is, and whether a visitor can tell what to do next.",
};

const ORDER: RuleCategory[] = ["accessibility", "hierarchy", "clarity"];

export default function ScoringPage() {
  const byCategory = ORDER.map((category) => ({
    category,
    rules: ALL_RULES.filter((r) => r.category === category),
  }));

  const visualCount = ALL_RULES.filter((r) => r.id.startsWith("visual-")).length;

  return (
    <main className="app">
      <header className="header">
        <div className="eyebrow">
          <span className="dot" /> {ALL_RULES.length} checks
        </div>
        <h1>
          How <em>scoring</em> works
        </h1>
        <p className="subtitle">
          Every score comes from these rules, not from a language model. The same
          page always produces the same number.
        </p>
      </header>

      <section className="section-card scoring-intro">
        <div className="section-title">The formula</div>
        <p className="prose-block">
          Each rule declares a maximum penalty and whether it applies to the page
          being audited. A category&rsquo;s score is:
        </p>
        <pre className="formula">
          100 × (1 − penalties incurred / penalties possible on this page)
        </pre>
        <p className="prose-block">
          Normalising over <strong>applicable</strong> rules is what stops a
          nearly empty page scoring well for the checks it never triggered — a
          page with no images gets no credit for &ldquo;all images have alt
          text&rdquo;. The overall score is the mean of the active category
          scores.
        </p>
        <p className="prose-block">
          {visualCount} of the {ALL_RULES.length} rules need the page to be
          rendered in a real browser. Where no browser is available they are
          skipped entirely — they neither pass nor fail, and the report says so.
        </p>
      </section>

      {byCategory.map(({ category, rules }) => (
        <section key={category} className="section-card">
          <div className="section-title">
            <span className="section-badge badge-info">{rules.length}</span>
            {CATEGORY_LABEL[category]}
          </div>
          <p className="prose-block scoring-cat-intro">{CATEGORY_INTRO[category]}</p>

          <div className="rule-list">
            {rules.map((rule) => {
              const doc = RULE_DOCS[rule.id];
              return (
                <article key={rule.id} className="rule-doc">
                  <div className="finding-tags">
                    <span className={`tag tag-sev-${rule.severity}`}>{rule.severity}</span>
                    <span className="tag">−{rule.maxPenalty} max</span>
                    <span className="tag">{rule.effort} effort</span>
                    {rule.wcag && <span className="tag tag-wcag">WCAG {rule.wcag}</span>}
                    {rule.id.startsWith("visual-") && (
                      <span className="tag tag-ai">needs rendering</span>
                    )}
                  </div>
                  <h2 className="rule-doc-title">{doc.what.en}</h2>
                  <code className="rule-doc-id">{rule.id}</code>
                  <dl className="rule-doc-meta">
                    <dt>Applies</dt>
                    <dd>{doc.when.en}</dd>
                    <dt>Does not detect</dt>
                    <dd>{doc.limitation.en}</dd>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <section className="section-card">
        <div className="section-title">What the AI layer does — and does not</div>
        <p className="prose-block">
          A separate, optional layer sends the rendered screenshot and the page
          copy to Claude. It writes the summary and adds observations a rule
          engine cannot make — whether a headline says anything, whether the
          primary action looks primary. Every AI observation must quote the page
          or it is discarded before reaching the report.
        </p>
        <p className="prose-block">
          <strong>It never touches the score.</strong> The number is produced by
          the rules above before the model is called, and an audit run with the
          AI layer disabled returns exactly the same score.
        </p>
      </section>

      <p className="scoring-back">
        <Link href="/">← Run an audit</Link>
      </p>
    </main>
  );
}
