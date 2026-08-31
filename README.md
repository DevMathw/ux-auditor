# UX Auditor

> Live site: **[ux-auditor-chi.vercel.app](https://ux-auditor-chi.vercel.app)**

Paste any URL and get a **verifiable** UX report: 27 automated checks — each one
showing the evidence that triggered it — measured against both the page markup
and the page as a browser actually renders it, plus an AI that looks at a
screenshot and tells you what the design communicates.

---

## Preview

![UX Auditor preview](./public/preview.png)

---

## Why it isn't just a wrapper around an LLM

Most "AI audit" tools hand a URL to a model and print whatever comes back. That
produces prose that reads well and cannot be checked, with a score that changes
between runs. This one is built the other way around.

**A deterministic rule engine produces the report. The model only interprets it.**

It runs in three layers, each optional and each degrading cleanly to the one
below:

| Layer | Needs | Adds | Cost |
|---|---|---|---|
| **Markup** | nothing | 22 rules on the served HTML | $0.000 |
| **Rendered** | a Chromium binary | 5 more rules: contrast, type size, tap targets, horizontal overflow, first screen | $0.000 |
| **Interpretation** | an API key | a screenshot-reading design review | ~$0.016 |

Turn off the top two and you still get a complete, reproducible audit in under
half a second.

| | Model writes the report | This architecture |
|---|---|---|
| Same page, audited twice | Score moved 3–8 points | **Byte-identical** |
| Evidence per issue | None | Selector, HTML snippet, count, WCAG criterion |
| Cost per audit | ~$0.035 | ~$0.016, or **$0 with the AI layer off** |
| Contrast, type size, tap targets | invisible | measured from the rendered page |
| If the model fails | Whole audit fails | Full deterministic report is still returned |

Because the score comes from rules, **re-auditing and before/after comparison
actually mean something** — the two features that are impossible when a model
picks the number.

The AI layer is not decoration: it does the part rules cannot. It receives a
screenshot of the rendered page and judges what the markup cannot express —
whether the value proposition lands, whether the primary action *looks* primary,
whether the visual order matches the decision the visitor has to make. Every AI
observation must quote the page, or it is discarded before it reaches the report.

Making the model multimodal costs about **$0.001** per audit.

Numbers above are measured — method and raw results in
[`docs/measurements.md`](./docs/measurements.md).

---

## What it checks

27 rules across three categories, each with a severity, an impact, an effort
estimate, and a concrete fix.

**From the markup (22)**

- **Accessibility** — language declaration, page title, viewport and zoom, image
  alt text, `main` landmark, H1 structure, form labels, button names, link text,
  skip link, positive tabindex, iframe titles
- **Visual hierarchy** — heading order, heading density relative to content
  length, structural landmarks, inline-style sprawl
- **UX clarity** — meta description, title quality, call to action, link-preview
  tags, content depth, favicon

**From the rendered page (5)**

- **Contrast** — real WCAG ratios against the composited background, at the
  correct threshold for large text
- **Type size** — running text measured in rendered pixels
- **Tap targets** — measured in a 390px mobile viewport, excluding visually
  hidden skip links
- **Horizontal overflow** — content wider than a phone screen
- **First screen** — whether anything above the fold says what this is or what
  to do

Rules that do not apply to a page are excluded from its score, so a nearly empty
page cannot score well for the things it simply does not have. When the served
HTML is too thin to judge — a client-rendered shell with no browser available —
the report says so instead of reporting a confident score.

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + CSS custom properties |
| Parsing | node-html-parser |
| Rendering | Playwright (playwright-core) |
| AI | Claude API (`claude-sonnet-5`), structured outputs |
| Deployment | Vercel |

---

## Getting started

```bash
git clone https://github.com/DevMathw/ux-auditor.git
cd ux-auditor
npm install
cp .env.example .env.local   # then add your Anthropic API key
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Requires Node 20.9+.

The AI layer is optional — without `ANTHROPIC_API_KEY` the app still returns a
complete deterministic audit.

## Environment variables

```env
ANTHROPIC_API_KEY=sk-ant-...          # optional; enables the interpretation layer
NEXT_PUBLIC_SITE_URL=https://...      # optional; canonical URLs and sitemap
PLAYWRIGHT_EXECUTABLE_PATH=/path/...  # optional; overrides browser auto-detection
```

---

## Project structure

```
app/
├── api/
│   ├── audit/          # orchestrates rules → AI layer → report
│   └── explain/        # explains one finding on demand
├── components/
│   ├── AuditWorkspace  # client shell; report UI is code-split
│   ├── FindingsList    # findings grouped by severity
│   └── FindingCard     # one finding + its evidence and fix
├── lib/
│   ├── rules/          # the 27 deterministic checks
│   │   ├── accessibility.ts
│   │   ├── hierarchy.ts
│   │   ├── clarity.ts
│   │   ├── visual.ts   # needs a rendered page
│   │   └── index.ts    # registry + normalised scoring
│   ├── render.ts       # Playwright layer: computed styles + screenshot
│   ├── auditCache.ts   # content-hash cache
│   ├── auditSchema.ts  # AI output schema + validation
│   ├── buildPrompt.ts  # interpretation-layer prompt
│   ├── fetchPage.ts    # SSRF-safe fetcher, size-capped
│   ├── i18n.ts         # EN/ES
│   └── rateLimit.ts
tests/
├── rules.test.ts            # 26 tests: markup rules, scoring, determinism
└── visual-rules.test.ts     # 16 tests: visual rules on synthetic snapshots
docs/
├── measurements.md          # every number in this README, with method
└── commercial-readiness.md  # what's needed to charge for this
```

---

## How scoring works

Each rule declares a maximum penalty and whether it applies to the page. A
category's score is:

```
100 × (1 − penalties incurred / penalties possible on this page)
```

Normalising over *applicable* rules is what stops a trivial page scoring highly
for the checks it never triggered. The overall score is the mean of the active
category scores.

Calibration check: `w3.org/WAI` — the body that publishes WCAG — scores 100, and
still scores 100 with the five visual rules active (27/27).
`news.ycombinator.com` scores 55, with 268 text elements below the contrast
minimum and 30 tap targets under 24px.

Run the suite with `npm test`: 42 tests, no network, under 7 seconds. They
encode the properties the product sells — the same HTML always produces the same
report, a rule that does not apply never counts as passed, and every false
positive found during calibration has a test so it cannot come back.

---

## Security

The server fetches arbitrary user-supplied URLs, which is a dangerous thing to
do carelessly.

- **SSRF guard** — resolves DNS and rejects private, loopback, link-local, CGNAT
  and cloud-metadata addresses, re-validating on every redirect hop
- **Size cap** — 1.5 MB, read as a stream and aborted past the limit
- **Content-type check** — must return HTML
- **Rate limiting** — per IP, in memory (needs a shared store for production)
- **Prompt injection** — page content is fenced and labelled untrusted; AI
  findings are dropped unless they quote the page

Rendering executes third-party JavaScript on our server, which is a second,
larger attack surface. It is contained by:

- **Chrome's sandbox stays on.** It is disabled only when the host cannot
  support it (`PLAYWRIGHT_NO_SANDBOX=1`), never by default
- **Every browser request is filtered** through the same public-address check as
  the HTTP fetcher, so a page cannot use our browser to reach `169.254.169.254`
  or any private host. Verified: a page that tries to `fetch()` a loopback
  resource and exfiltrate it lands **zero** requests on that resource
- **A fresh browser context per audit**, with no storage, no extensions and no
  background networking; the browser is closed in a `finally` block
- **Output escaping** — PDF export escapes everything and renders under a CSP
  that blocks script execution

---

## Limitations

- Contrast is measured against the composited background colour; elements over
  a gradient or image are reported as indeterminate rather than guessed at
- Rendering adds 5-15 s per audit and needs a Chromium binary
- Without a browser the visual rules are skipped, and a client-rendered page is
  flagged as low confidence rather than scored confidently
- Rate limiting is per-instance and in-memory
- History lives in the browser; clearing site data loses it

---

## Contact

**Mateo Garcia** — Full-stack Developer
[mathw.dev](https://mathw.dev) · [LinkedIn](https://www.linkedin.com/in/mateo-garcia-rodriguez-933135207/)
