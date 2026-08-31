# API

Four endpoints. The three public ones need no authentication; `/api/usage` is
token-gated because operating cost is business data. See
[commercial-readiness.md](./commercial-readiness.md) for what would change
before this could be offered as a public API with keys and quotas.

Base URL is the deployment origin. All request and response bodies are JSON.

---

## `POST /api/audit`

Runs a full audit: fetches the URL, renders it if a browser is available, runs
the deterministic rules, and optionally adds the AI interpretation layer.

### Request

```json
{
  "url": "https://example.com",
  "checks": {
    "accessibility": true,
    "visualHierarchy": true,
    "uxClarity": true
  },
  "language": "en",
  "ai": true,
  "visual": true
}
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `url` | string | yes | — | Must be `http:` or `https:`, max 2048 chars |
| `checks` | object | no | all `true` | Any field omitted defaults to `true`. If all three are `false`, all three are re-enabled — an audit of nothing is not a useful response |
| `language` | `"en"` \| `"es"` | no | `"en"` | Language of the report text |
| `ai` | boolean | no | `true` | `false` skips the interpretation layer. The score is identical either way |
| `visual` | boolean | no | `true` | `false` skips rendering, so the 5 visual rules do not apply |

### Response `200`

```json
{
  "audit": {
    "version": 2,
    "overallScore": 55,
    "scoreBreakdown": {
      "accessibility": { "score": 46, "rulesApplicable": 12, "rulesPassed": 5 },
      "visualHierarchy": { "score": 47, "rulesApplicable": 5, "rulesPassed": 2 },
      "uxClarity": { "score": 58, "rulesApplicable": 6, "rulesPassed": 3 }
    },
    "checksPassed": 10,
    "checksApplicable": 23,
    "confidence": "high",
    "confidenceReason": null,
    "rendered": true,
    "aiEnabled": true,
    "summary": "…",
    "quickWins": "…",
    "strengths": "…",
    "findings": [
      {
        "id": "visual-contrast",
        "category": "accessibility",
        "severity": "critical",
        "impact": "high",
        "effort": "low",
        "title": "268 text elements below the contrast minimum",
        "description": "…",
        "fix": "…",
        "wcag": "1.4.3",
        "source": "rule",
        "evidence": [
          {
            "selector": "td.title > span.rank",
            "detail": "3.54:1 (minimum 4.5:1) · rgb(130, 130, 130) on rgb(246, 246, 239)",
            "snippet": "1."
          }
        ]
      }
    ]
  },
  "analyzedUrl": "https://example.com/",
  "cached": false
}
```

Fields worth understanding:

- **`confidence`** — `"low"` means the served HTML had under 60 words and no
  browser was available, so the audit describes the shell rather than the page a
  visitor sees. Treat the score as unreliable when this is `"low"`.
- **`rendered`** — whether the 5 visual rules ran. When `false`, contrast, type
  size, tap targets, horizontal overflow and first-screen checks were skipped
  and excluded from the score.
- **`source`** — `"rule"` findings are deterministic and reproducible.
  `"ai"` findings are interpretations; they always carry a quote from the page
  as evidence, and **never affect the score**.
- **`cached`** — the response came from the content-hash cache. Same page
  content, same report, no model call.

### Errors

| Status | `error` | Meaning |
|---|---|---|
| `400` | `invalid_url` | Missing, malformed, or over 2048 characters |
| `400` | `invalid_protocol` | Not `http:` or `https:` |
| `400` | `invalid_body` | Body was not valid JSON |
| `400` | `fetch_blocked` | The target resolves to a private, loopback, link-local or cloud-metadata address |
| `413` | `payload_too_large` | Request body over 8 KB |
| `422` | `fetch_unreachable` | DNS failure, timeout, or a non-2xx response from the target |
| `422` | `fetch_not_html` | The target returned something other than HTML |
| `422` | `fetch_too_large` | The page exceeds the 1.5 MB download cap |
| `429` | `rate_limited` | Includes `retryAfter` (seconds) and a `Retry-After` header |
| `500` | `analysis_failed` | Unexpected server error |

**A failing AI layer or a failing browser is not an error.** Both degrade: the
response is `200` with `aiEnabled: false` or `rendered: false`. The deterministic
report is always delivered if the page could be fetched.

### Limits

| Limit | Value | Where |
|---|---|---|
| Rate limit | 10 requests / 5 min per IP | `app/lib/rateLimit.ts` |
| Request body | 8 KB | route handler |
| Page download | 1.5 MB | `app/lib/fetchPage.ts` |
| Redirects followed | 3, each re-validated | `app/lib/fetchPage.ts` |
| Function duration | 60 s | `maxDuration` |
| Cache TTL | 30 min, keyed on content hash | `app/lib/auditCache.ts` |

The rate limiter is in-memory and per-instance. Behind multiple instances each
keeps its own count — it is a cost control, not a security boundary.

### Example

```bash
curl -X POST https://ux-auditor-chi.vercel.app/api/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","language":"en"}'
```

Deterministic only, no AI cost, sub-second:

```bash
curl -X POST https://ux-auditor-chi.vercel.app/api/audit \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://example.com","ai":false,"visual":false}'
```

---

## `POST /api/explain`

Explains one finding in plain language. Used by the "Explain this" button.

### Request

```json
{
  "title": "No H1 heading",
  "description": "The page has no H1, so there is no single statement of what it is about.",
  "category": "accessibility",
  "severity": "high",
  "language": "en"
}
```

| Field | Type | Notes |
|---|---|---|
| `title` | string | Truncated to 200 chars |
| `description` | string | Truncated to 600 chars |
| `category` | string | Must be `accessibility`, `hierarchy`, `clarity` or `performance`; anything else falls back to `clarity` |
| `severity` | string | Must be `high`, `medium` or `low`; anything else falls back to `medium` |
| `language` | `"en"` \| `"es"` | Defaults to `"en"` |

At least one of `title` or `description` must be non-empty.

The title and description are treated as **untrusted data**: they are stripped
of control characters, length-capped, and the system prompt states explicitly
that content in the user message is report data and never instructions.

### Response `200`

```json
{ "explanation": "Screen readers build a document outline from headings…" }
```

### Errors

| Status | `error` |
|---|---|
| `400` | `invalid_body` |
| `413` | `payload_too_large` |
| `429` | `rate_limited` |
| `502` | `explanation_failed` |
| `503` | `upstream_rate_limited` |
| `504` | `model_timeout` |

Rate limit: 30 requests / 5 min per IP — higher than `/api/audit` because one
report generates several explanation requests.

---

## `GET /api/health`

Reports which of the three layers this deployment can actually run. It exists
because the rendering and AI layers degrade silently: without this there is no
way to tell from outside whether the visual rules are running.

### Response `200`

```json
{
  "status": "ok",
  "layers": {
    "rules":     { "status": "up", "count": 27, "active": 27 },
    "rendering": { "status": "up", "provider": "local", "reason": null },
    "ai":        { "status": "up", "model": "claude-sonnet-5" }
  },
  "timestamp": "2026-08-31T15:48:00.178Z"
}
```

| Field | Meaning |
|---|---|
| `rules.count` | Rules registered in the engine |
| `rules.active` | Rules that can run here — drops to 22 without a browser |
| `rendering.provider` | `remote`, `serverless` or `local` |
| `rendering.reason` | When degraded: `no_browser_found` or `serverless_package_missing` |
| `ai.status` | `up` when `ANTHROPIC_API_KEY` is set. The key itself is never exposed |

`status` is `"ok"` whenever the deterministic engine can run. A degraded
rendering or AI layer is **not** a failure — the app is designed to work with
any subset of layers. It returns `503` only if the rule engine itself is
unavailable.

Returns `Cache-Control: no-store`.

---

## `GET /api/usage`

What it costs to run the AI layer on this instance. Answers "how much does this
cost to operate?" with measured numbers rather than estimates.

**Gated by a token.** Without `USAGE_TOKEN` set the endpoint returns `404` — an
endpoint that does not exist is safer than one accidentally left open. With it
set, requests need `Authorization: Bearer <token>` or they get `401`.

```bash
curl -H "Authorization: Bearer $USAGE_TOKEN" https://your-deploy/api/usage
```

### Response `200`

```json
{
  "audits": 42,
  "aiCalls": 31,
  "freeAudits": 11,
  "screenshots": 28,
  "inputTokens": 74210,
  "outputTokens": 27880,
  "totalCostUsd": 0.42722,
  "averageCostPerAiCallUsd": 0.01378,
  "since": "2026-08-31T20:41:49.299Z",
  "pricing": { "model": "claude-sonnet-5", "inputPerMTok": 2.0, "outputPerMTok": 10.0 },
  "note": "Totals since this instance started. In-memory, so they reset on deploy."
}
```

`freeAudits` counts audits that ran deterministically with no model call — the
number that makes a free tier viable. `pricing` is included so the cost figure
can be checked rather than taken on faith.

Totals live in memory and reset on deploy. A persistent store is the obvious
next step, and is listed in
[commercial-readiness.md](./commercial-readiness.md).
