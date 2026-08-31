# Measurements

Every number quoted in the README and in `commercial-readiness.md`, with the
method used to get it, so they can be re-checked rather than trusted.

Measured on: Windows 11, Node 24.11, Chrome headless, `next start` production
build served on `localhost:3100`.

---

## Machine caveat

Lighthouse reports `benchmarkIndex` for the machine it runs on. Lighthouse
treats **under 800 as a slow machine**; this one measured **428–723 across
runs**. Two consequences:

- Absolute Performance scores here are pessimistic versus normal hardware.
- Mobile runs are not reproducible on this machine: across three identical runs,
  Total Blocking Time ranged **846 ms → 2,528 ms** and Performance **67 → 72**.
  That spread is wider than most changes worth making, so mobile numbers below
  are reported but should not be treated as a baseline.

Desktop runs were stable and are the meaningful comparison.

Lighthouse's own simulated "server response time" is also unreliable here: it
reported 850 ms while `curl` measured a **12 ms median** over 10 requests
against the same server.

---

## Lighthouse — desktop preset

| Category | Before | After |
|---|---|---|
| Performance | 69 | **98** |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

| Metric | Before | After | Change |
|---|---|---|---|
| Total Blocking Time | 1,331 ms | 99 ms | **−93%** |
| Speed Index | 1,506 ms | 743 ms | −51% |
| JS bootup time | 1.5 s | 0.3 s | **−80%** |
| First Contentful Paint | 480 ms | 527 ms | +10% |
| Largest Contentful Paint | 680 ms | 852 ms | +25% |

The LCP and FCP regressions are explained below.

## Lighthouse — mobile preset

| Category | Before | After (median of 3) |
|---|---|---|
| Performance | 71 | 69 |
| Accessibility | 100 | 100 |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

Mobile TBT median improved (2,186 ms → 1,024 ms) but the run-to-run spread
(846–2,528 ms) makes the Performance score inconclusive on this hardware.

### Why LCP got worse

The LCP element is `p.subtitle` in both runs. The subtitle copy was
deliberately lengthened — from a generic "AI-powered analysis" line to one that
states what the product actually returns (22 checks, evidence, reproducible
score). A longer paragraph is a larger LCP element that paints later.

This was kept. Shortening product copy to move a metric is the kind of
Lighthouse optimisation that improves the score and not the product.

---

## AI cost per audit

Method: build the real prompt via `buildPrompt`, call `claude-sonnet-5` with the
production schema, read `usage` off the response. Priced at $2/MTok input,
$10/MTok output.

### Before (model generated the whole report)

| Site | In | Out | Latency | Cost |
|---|---|---|---|---|
| example.com | 517 | 1,651 | 18.2 s | $0.0197 |
| developer.mozilla.org | 1,100 | 3,584 | 37.4 s | $0.0402 |
| stripe.com | 1,218 | 4,000 (**truncated**) | 42.0 s | $0.0446 → **failed** |

Cost was ~90% output. stripe.com exhausted `max_tokens`, so the request was paid
for and then returned an error.

### After (rules produce the report, model only interprets)

| Site | In | Out | Latency | Cost |
|---|---|---|---|---|
| example.com | 1,642 | 698 | 9.6 s | $0.0103 |
| developer.mozilla.org | 2,285 | 846 | 11.6 s | $0.0130 |
| stripe.com | 2,377 | 1,695 | 19.4 s | $0.0217 |

**Average: $0.035 → $0.015. No truncation. Latency roughly halved.**

Input tokens went up (more context is sent) but input is 5× cheaper than output,
so the trade is strongly positive.

### Paths that cost nothing

| Path | Latency | Cost |
|---|---|---|
| `ai: false` — deterministic audit | 0.41 s | $0.000 |
| Cache hit on unchanged content | 0.83 s | $0.000 |

---

## Score reproducibility

The reason the rule engine exists.

### Before — model assigned the scores

Same URL, same prompt, three consecutive runs:

| Run | Overall | A11y | Hierarchy | Clarity | Findings |
|---|---|---|---|---|---|
| 1 | 48 | 45 | 42 | 58 | 7 |
| 2 | 48 | 45 | 42 | 58 | 7 |
| 3 | **45** | **42** | **45** | **50** | **6** |

One run in three disagreed. Re-audit and before/after comparison are not
possible on top of that.

### After — rules assign the scores

`JSON.stringify(runRules(html, url, checks))` compared across two runs on five
sites: **byte-identical every time.**

Confirmed end-to-end through the HTTP API: the same page audited with the AI
layer on and off returns **the same score (50)** — proof the number comes from
the rules and not from the model.

---

## Rendering layer

Added after the markup-only engine. Playwright drives a system Chrome, measures
computed styles in two viewports from a single page load, and captures a JPEG.

### What rendering changes

| Site | Markup only | Rendered | Confidence |
|---|---|---|---|
| w3.org/WAI | 100 · 22 rules | **100 · 27 rules** | high → high |
| news.ycombinator.com | 50 · 20 rules | 55 · 25 rules | high → high |
| example.com | 66 · 17 rules | 70 · 21 rules | **low → high** |
| airbnb.com | 93 · 20 rules | **89 · 25 rules** | **low → high** |

W3C WAI still scores 100 with five extra visual rules active — the calibration
anchor holds. airbnb is the case that motivated the work: markup-only gave it a
confident 93 while reading 44 words; rendered, it reads the real page and finds
a genuine horizontal-overflow bug.

### What the visual rules find that markup cannot

On `news.ycombinator.com`:

- **268 of 317 text elements below the contrast minimum** — e.g. `td.title > span.rank`
  at 3.54:1 where 4.5:1 is required, `rgb(130,130,130)` on `rgb(246,246,239)`
- **30 of 31 tap targets under 24px** — the upvote arrows measure 18×10px

On `airbnb.com`:

- **Horizontal scroll on mobile** — 472px of content in a 390px viewport

None of these are visible in HTML. All are measured from the rendered page.

### False positive found and fixed

`a.screen-reader-only` on airbnb measured 1×1px and was reported as an
undersized tap target. Skip links are *deliberately* 1×1 until focused, so the
rule was penalising the correct accessibility practice. Elements with a
clipping `clip`/`clip-path`, or smaller than 4×4px, are now excluded.

### Security of the rendering layer

Rendering runs untrusted JavaScript, so two mitigations were verified rather
than assumed:

- **Chrome's sandbox is on by default.** An earlier draft passed `--no-sandbox`
  unconditionally for serverless compatibility; that is now opt-in via
  `PLAYWRIGHT_NO_SANDBOX=1`.
- **Browser requests are filtered** through the same public-address check as the
  HTTP fetcher. Test: a local page that loads `<img src="http://127.0.0.1:9911">`
  and calls `fetch('http://127.0.0.1:9911/exfil')` plus
  `fetch('http://169.254.169.254/...')`. Result: **0 requests reached the
  internal server**, and the main navigation to a private address was blocked too.
- **No regression on public sites** — example.com, news.ycombinator.com and
  w3.org/WAI all render normally with the filter active.

### Latency and cost

| Stage | Time |
|---|---|
| Page render (both viewports + screenshot) | 5–15 s |
| AI interpretation | 11–15 s |
| Full audit, end to end | ~28 s |

| Path | Cost |
|---|---|
| AI layer, text only | $0.0150 |
| AI layer **with screenshot** | **$0.0163** |

The screenshot adds roughly **$0.001** per audit. Making the model multimodal is
almost free; the JPEG is compressed at quality 62 and runs 14–112 KB.

---

## Rule engine calibration

Run against five sites with all three categories enabled:

Markup-only run (before the rendering layer was added):

| Site | Overall | Checks passed | Findings |
|---|---|---|---|
| w3.org/WAI | **100** | 22/22 | 0 |
| stripe.com | 97 | 18/20 | 2 |
| developer.mozilla.org | 95 | 19/21 | 2 |
| example.com | 66 | 10/17 | 7 |
| news.ycombinator.com | **50** | 9/20 | 11 |

The W3C Web Accessibility Initiative — the body that writes WCAG — scoring
22/22 is the sanity check that the rules are not producing noise. Hacker News
scoring 50 is correct: no `h1`, no `main`, no landmarks, an unlabelled search
field, no meta description.

### False positives found and fixed during calibration

| Symptom | Cause | Fix |
|---|---|---|
| stripe.com: "29 links with uninformative text" | Links labelled by `<svg role="img" aria-label="…">`, which the accessible-name calculation did not read | `accessibleName()` now reads SVG `aria-label` and `<svg><title>` |
| stripe.com: "2 H1 headings" | The second `h1` carries `aria-hidden="true"` — a decorative visual duplicate that does not exist in the accessibility tree | Rules skip `aria-hidden` subtrees |
| example.com scoring 80 despite being nearly empty | Rules that did not apply (no images → "all images have alt") counted as passes | Rules declare `applies()`; the score is normalised over applicable rules only |

Verified as a **true** positive, not a bug: `developer.mozilla.org` really does
serve zero `<main>` elements (`grep -c '<main'` returns 0).

---

## Test suite

`npm test` — 42 tests, ~6 s, no network.

- `tests/rules.test.ts` (26) — determinism, score bounds, applicability, and one
  test per markup rule, including the three false positives found during
  calibration so they cannot regress
- `tests/visual-rules.test.ts` (16) — visual rules driven by synthetic
  `VisualSnapshot` fixtures, so they run fast and offline

The suite encodes the properties the product sells: the same HTML always
produces the same report, a rule that does not apply never counts as passed, and
a rendered page raises confidence.
