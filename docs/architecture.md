# Architecture

The whole design follows from one decision: **the score is produced by
deterministic rules, and the language model never touches it.**

Everything else — the layering, the caching, the degradation behaviour, the
comparison feature — is a consequence of that.

---

## Request flow

```mermaid
flowchart TD
    U[Visitor] --> UI[Next.js UI<br/>client shell, report UI code-split]
    UI -->|POST /api/audit| RT[Route handler<br/>validate · rate limit · map errors]
    RT --> RA[runAudit<br/>domain layer, no HTTP knowledge]

    RA --> F{{fetchPage<br/>SSRF guard · 1.5 MB cap}}
    F -->|blocked / unreachable| ERR[Typed failure → 4xx]
    F -->|HTML| CK[Content-hash cache]

    CK -->|hit| OUT[AuditResult]
    CK -->|miss| R{{renderPage<br/>optional}}

    R -->|no browser| RULES
    R -->|computed styles + screenshot| RULES[Deterministic engine<br/>27 rules]

    RULES --> SCORE[Score + findings with evidence<br/>REPRODUCIBLE]
    SCORE --> AI{{Interpretation layer<br/>optional}}

    AI -->|model fails| OUT
    AI -->|summary + quoted insights| OUT
    OUT --> UI
```

The two `optional` boxes are the point. Each can fail or be absent, and the
request still returns a complete, useful report.

---

## Three layers, three failure modes

| Layer | Needs | Adds | Cost | If unavailable |
|---|---|---|---|---|
| **Markup rules** | nothing | 22 rules on the served HTML | $0.000 | Cannot fail — this is the floor |
| **Rendered rules** | a Chromium binary | 5 rules: contrast, type size, tap targets, horizontal overflow, first screen | $0.000 | Rules are skipped, excluded from the score, `rendered: false` |
| **Interpretation** | `ANTHROPIC_API_KEY` | summary + quoted design observations | ~$0.016 | Deterministic summary is generated instead, `aiEnabled: false` |

`GET /api/health` reports which layers are actually up in a given deployment,
so the degradation is visible from outside rather than silent.

---

## Why rules, not a model, produce the score

Measured before the rewrite: the same page audited three times with a model
choosing the score returned **48, 48, 45**, with a different number of findings
each time.

That makes three features impossible:

- **Re-audit** — a 3-point move means nothing
- **Before/after comparison** — you cannot tell a fix from noise
- **Trust** — a number that changes on refresh is not a measurement

With a rule engine the same HTML always produces a byte-identical report. That
is what makes `app/lib/compare.ts` meaningful, and it is verified by a test that
asserts an audit with the AI layer on and off returns the same score.

The model still does real work — reading the rendered screenshot and judging
whether the design communicates — but its output is additive, marked
`source: "ai"`, and discarded if it does not quote the page.

---

## Scoring

Per category:

```
score = 100 × (1 − penalties incurred / penalties possible on this page)
```

Each rule declares a `maxPenalty` and an `applies()` predicate. Rules that do
not apply are excluded from **both** sides of that fraction.

This matters more than it looks. Without it, a nearly empty page scores well for
everything it does not have — no images means "all images have alt text" passes.
That bug was real: `example.com` scored 80 before applicability was introduced,
66 after.

Calibration anchor: `w3.org/WAI`, published by the body that writes WCAG, scores
100 with all 27 rules active.

---

## Module layout

```
app/
├── page.tsx, scoring/page.tsx     Presentation (Server Components)
├── components/                    Presentation (Client Components)
│   └── AuditWorkspace             the only stateful shell; report UI is code-split
├── api/
│   ├── audit/route.ts             HTTP: validate, rate limit, map errors to status
│   ├── explain/route.ts           HTTP
│   └── health/route.ts            HTTP: capability report
└── lib/
    ├── runAudit.ts                Domain: the use case, dependency-injected
    ├── rules/                     Domain: the 27 checks + their docs
    ├── compare.ts                 Domain: before/after diff
    ├── exporters.ts               Domain: JSON / Markdown serialisation
    ├── fetchPage.ts               Infrastructure: SSRF-safe HTTP
    ├── render.ts                  Infrastructure: Playwright
    ├── browserProvider.ts         Infrastructure: which Chromium, and how
    ├── auditCache.ts              Infrastructure: content-hash cache
    ├── rateLimit.ts               Infrastructure: fixed-window limiter
    └── usage.ts                   Infrastructure: AI cost accounting
```

`runAudit()` takes its external dependencies as an argument, so the integration
tests exercise the real orchestration — including every degradation path —
without network, browser or model.

---

## Security boundaries

The server fetches and **executes** arbitrary user-supplied pages. Two distinct
attack surfaces:

**HTTP fetch.** `isPublicTarget()` resolves DNS and requires every returned
address to be public, re-validated on each of up to 3 redirect hops. A domain
that resolves to `127.0.0.1` is rejected before any request is made. 35 tests
cover this with mocked DNS, because a real attacker controls their own DNS.

**Rendered page.** The browser runs third-party JavaScript, which reopens the
same hole from inside. Every browser request is routed through the *same*
`isPublicTarget()` check. Verified: a page that tries to `fetch()` a loopback
resource lands zero requests on it. Chrome's sandbox stays on unless the host
cannot support it.

**Prompt injection.** Page content is fenced and labelled untrusted in the
prompt, and AI findings are dropped unless they quote the page — so an injected
instruction cannot become a finding without also being visible as a quote.

**CSP.** A per-request nonce with `strict-dynamic` replaces
`script-src 'unsafe-inline'`. This requires dynamic rendering, which costs a
measured 9 ms of TTFB. `style-src` keeps `'unsafe-inline'` because nonces do not
apply to `style=` attributes and a style attribute cannot execute JavaScript.

---

## Deployment

```mermaid
flowchart LR
    subgraph Vercel
        E[Proxy<br/>CSP nonce] --> P[Next.js<br/>dynamic pages]
        P --> FN[Route handlers<br/>Node runtime, 60 s]
    end
    FN --> AN[Claude API]
    FN --> BR{Browser}
    BR -.->|remote| RB[CDP endpoint<br/>BROWSER_WS_ENDPOINT]
    BR -.->|serverless| SC["@sparticuz/chromium<br/>optional dependency"]
    BR -.->|local| LC[Installed Chrome<br/>development]
```

`browserProvider.ts` resolves those three in order. The honest state of this is
documented in [measurements.md](./measurements.md#serverless-rendering) —
including what is verified and what is not.
