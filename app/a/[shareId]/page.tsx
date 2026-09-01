import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import FindingsList from "@/app/components/FindingsList";
import ScoreRing from "@/app/components/ScoreRing";
import SummaryCards from "@/app/components/SummaryCards";
import { getRating, getScoreColor } from "@/app/lib/score";
import { getStore } from "@/app/lib/storage";
import { LOCALES, t as translate } from "@/app/lib/i18n";

/**
 * Informe compartido, de sólo lectura.
 *
 * Es la razón principal de tener almacenamiento: un informe que sólo existe en
 * el navegador de quien lo pidió no se puede enseñar a nadie. Aquí no hay
 * sesión ni cookie — quien tiene el enlace, ve el informe.
 *
 * Sirve el informe tal y como se generó. No vuelve a auditar: un enlace cuya
 * puntuación cambiase al abrirlo no serviría como referencia de nada.
 *
 * Reutiliza los componentes del informe normal a propósito. Una copia con su
 * propio marcado se desincronizaría en el primer cambio.
 */
export const dynamic = "force-dynamic";

/** Un identificador con otra forma no llega a tocar la base de datos. */
const SHARE_RE = /^[0-9a-f]{22}$/;

async function load(shareId: string) {
  if (!SHARE_RE.test(shareId)) return null;
  try {
    return (await getStore()).audits.findByShareId(shareId);
  } catch {
    // Sin almacenamiento no hay enlaces compartidos; es un 404, no un error.
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function generateMetadata(props: PageProps<"/a/[shareId]">): Promise<Metadata> {
  const { shareId } = await props.params;
  const record = await load(shareId);
  if (!record) return { title: "Report not found" };

  const host = hostOf(record.url);
  return {
    title: `${host} — ${record.score}/100`,
    description: `UX audit report for ${host}. Score ${record.score}/100.`,
    // Un enlace compartido es privado por oscuridad; indexarlo lo haría público.
    robots: { index: false, follow: false },
  };
}

export default async function SharedReportPage(props: PageProps<"/a/[shareId]">) {
  const { shareId } = await props.params;
  const record = await load(shareId);
  if (!record) notFound();

  const { audit, language } = record;
  const t = translate(language);
  const breakdown = [
    ["accessibility", audit.scoreBreakdown.accessibility],
    ["visualHierarchy", audit.scoreBreakdown.visualHierarchy],
    ["uxClarity", audit.scoreBreakdown.uxClarity],
  ] as const;

  return (
    <main className="app">
      <div className="results">
        <p className="notice">
          {t.sharedReport} ·{" "}
          <time dateTime={record.createdAt}>
            {new Date(record.createdAt).toLocaleDateString(LOCALES[language], {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </p>

        <div className="analyzed-url">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span className="sr-only">{t.analyzedUrlLabel}: </span>
          {record.url}
        </div>

        <section className="score-section">
          <ScoreRing
            score={audit.overallScore}
            color={getScoreColor(audit.overallScore)}
            caption={t.outOf100}
          />
          <div className="score-meta">
            <h2>{t.ratings[getRating(audit.overallScore)]}</h2>
            <p className="checks-passed">
              {t.checksPassed(audit.checksPassed, audit.checksApplicable)}
            </p>
            {audit.summary && <p className="score-desc">{audit.summary}</p>}
            <div className="sub-scores">
              {breakdown
                .filter(([, v]) => v !== null)
                .map(([key, value]) => (
                  <div key={key} className="sub-score">
                    <div className="sub-score-name">{t.scoreLabels[key]}</div>
                    <div className="sub-score-val" style={{ color: getScoreColor(value!.score) }}>
                      {value!.score}
                    </div>
                    <div className="sub-score-detail">
                      {value!.rulesPassed}/{value!.rulesApplicable}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>

        {audit.rendered ? null : <p className="notice">{t.notRenderedNotice}</p>}

        <SummaryCards quickWins={audit.quickWins} strengths={audit.strengths} language={language} />
        <FindingsList findings={audit.findings} language={language} />

        <p className="notice">
          <Link href="/">{t.sharedRunYourOwn}</Link>
        </p>
      </div>
    </main>
  );
}
