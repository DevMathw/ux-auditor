import type { AuditChecks, PageInfo } from "./types";

export function buildPrompt(
  info: PageInfo,
  url: string,
  checks: AuditChecks
): string {
  const checkList = [
    checks.accessibility && "accessibility",
    checks.visualHierarchy && "visual hierarchy",
    checks.uxClarity && "UX clarity",
  ]
    .filter(Boolean)
    .join(", ");

  return `You are an expert UX auditor. Analyze this website data and return a JSON audit report.

URL: ${url}

PAGE DATA:
- Title: "${info.title}"
- Meta description: "${info.metaDesc}"
- H1 headings (up to 3): ${JSON.stringify(info.h1s)}
- H2 headings (up to 5): ${JSON.stringify(info.h2s)}
- Images: ${info.imgCount} total, ${info.imgsNoAlt} missing alt text
- Links: ${info.linkCount}, Buttons: ${info.btnCount}
- Forms: ${info.formCount}, Labels: ${info.labelCount}, Inputs: ${info.inputCount}
- lang attribute: "${info.langAttr}"
- Viewport meta: "${info.metaViewport}"
- Has skip link: ${info.hasSkipLink}
- Has ARIA attributes: ${info.hasARIA}
- Semantic elements: nav=${info.navCount}, main=${info.mainCount}, footer=${info.footerCount}
- Body text sample: "${info.bodyText}"

Evaluate these areas: ${checkList}

Return ONLY a valid JSON object with this exact structure (no markdown, no backticks):
{
  "overallScore": <0-100 integer>,
  "scoreBreakdown": {
    "accessibility": <0-100 or null if not checked>,
    "visualHierarchy": <0-100 or null if not checked>,
    "uxClarity": <0-100 or null if not checked>
  },
  "summary": "<2-sentence overall assessment>",
  "problems": [
    {
      "title": "<issue title>",
      "description": "<specific, actionable description>",
      "category": "<accessibility|hierarchy|clarity|performance>",
      "severity": "<high|medium|low>"
    }
  ],
  "improvements": [
    {
      "title": "<improvement title>",
      "description": "<concrete, specific recommendation>",
      "impact": "<high|medium|low>"
    }
  ],
  "quickWins": "<1-2 sentences on the fastest improvements>",
  "strengths": "<1-2 sentences on what this site does well>"
}

Be specific. Problems: 4-7 items. Improvements: 4-6 items. Score honestly — most real sites score 40-75.`;
}