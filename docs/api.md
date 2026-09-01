# API

Nine endpoints in three groups:

- **Public** — `/api/audit`, `/api/explain`, `/api/health`. No authentication.
- **Session** — `/api/audits` and its share sub-resource. Authenticated by the
  anonymous session cookie, which is issued automatically on the first audit.
- **Operator** — `/api/usage`, `/api/keys`, `/api/errors`. Gated by a single
  `ADMIN_TOKEN`; without it set, all three return `404`.

`/api/audit` also accepts an **optional API key**, which replaces the per-IP
rate limit with that key's own quota.

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

### Authentication (optional)

Send a key as `X-API-Key: uxa_…` or `Authorization: Bearer uxa_…`. With a valid
key the per-IP rate limit does not apply; the key's quota does instead, and one
unit is consumed **before** the audit runs, so a cancelled request still counts.
Without a key everything works exactly as before, limited by IP.

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
  "cached": false,
  "auditId": "dd245044-5e3a-4b49-b1c0-05c2e5975b6f"
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
- **`auditId`** — the id under which the server stored this report, needed to
  share it. It is `null` when storage was unavailable: the report is still
  delivered in full, it just cannot be shared.

The first audit of a session sets an `uxa_session` cookie — a random UUID,
`HttpOnly`, `SameSite=Lax`, 30 days. It carries no personal data and exists only
so `/api/audits` can show you your own reports and let you delete them.

### Errors

| Status | `error` | Meaning |
|---|---|---|
| `400` | `invalid_url` | Missing, malformed, or over 2048 characters |
| `400` | `invalid_protocol` | Not `http:` or `https:` |
| `400` | `invalid_body` | Body was not valid JSON |
| `400` | `fetch_blocked` | The target resolves to a private, loopback, link-local or cloud-metadata address |
| `401` | `invalid_api_key` | The key does not exist or is malformed |
| `401` | `revoked_api_key` | The key was revoked |
| `413` | `payload_too_large` | Request body over 8 KB |
| `422` | `fetch_unreachable` | DNS failure, timeout, or a non-2xx response from the target |
| `422` | `fetch_not_html` | The target returned something other than HTML |
| `422` | `fetch_too_large` | The page exceeds the 1.5 MB download cap |
| `429` | `rate_limited` | Includes `retryAfter` (seconds) and a `Retry-After` header |
| `429` | `quota_exceeded` | The API key used up its quota. Includes `quota` and `retryAfter` |
| `500` | `analysis_failed` | Unexpected server error |

**A failing AI layer or a failing browser is not an error.** Both degrade: the
response is `200` with `aiEnabled: false` or `rendered: false`. The deterministic
report is always delivered if the page could be fetched.

### Limits

| Limit | Value | Where |
|---|---|---|
| Rate limit (anonymous) | 10 requests / 5 min per IP | `app/lib/rateLimit.ts` |
| Quota (with API key) | per key, 24 h window, 100 by default | `app/lib/apiKeys.ts` |
| Request body | 8 KB | route handler |
| Page download | 1.5 MB | `app/lib/fetchPage.ts` |
| Redirects followed | 3, each re-validated | `app/lib/fetchPage.ts` |
| Function duration | 60 s | `maxDuration` |
| Cache TTL | 30 min, keyed on content hash | `app/lib/auditCache.ts` |
| Stored audits per session | 50 returned by `/api/audits` | `app/api/audits/route.ts` |

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

Reports which of the four layers this deployment can actually run. It exists
because the rendering and AI layers degrade silently: without this there is no
way to tell from outside whether the visual rules are running.

### Response `200`

```json
{
  "status": "ok",
  "layers": {
    "rules":     { "status": "up", "count": 27, "active": 27 },
    "rendering": { "status": "up", "provider": "local", "reason": null },
    "ai":        { "status": "up", "model": "claude-sonnet-5" },
    "storage":   { "status": "up", "driver": "sqlite", "location": "ux-auditor.db", "reason": null, "persistent": true }
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
| `storage.driver` | `sqlite` or `memory` — see the storage section below for `reason` |
| `storage.persistent` | Whether history and share links survive a restart |

`status` is `"ok"` whenever the deterministic engine can run. A degraded
rendering, AI or storage layer is **not** a failure — the app is designed to work with
any subset of layers. It returns `503` only if the rule engine itself is
unavailable.

Returns `Cache-Control: no-store`.

---

## `GET /api/usage`

What it costs to run the AI layer on this instance. Answers "how much does this
cost to operate?" with measured numbers rather than estimates.

**Gated by `ADMIN_TOKEN`,** shared with `/api/keys` and `/api/errors`. Without it
set the endpoint returns `404` — an endpoint that does not exist is safer than
one accidentally left open. With it set, requests need
`Authorization: Bearer <token>` or they get `401`. The comparison is
timing-safe, so a wrong token leaks nothing about the right one.

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://your-deploy/api/usage
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

Totals live in memory and reset on deploy. They are deliberately not stored:
they are an operational counter, not user data, and persisting them would mean
writing on every audit for a number nobody reads between deploys.

---

## `GET /api/health` — the storage layer

`/api/health` also reports storage, alongside rules, rendering and AI:

```json
"storage": {
  "status": "up",
  "driver": "sqlite",
  "location": "ux-auditor.db",
  "reason": null,
  "persistent": true
}
```

| `reason` | Meaning |
|---|---|
| `null` | SQLite opened normally |
| `forced_memory` | `STORAGE_DRIVER=memory` was set |
| `serverless_ephemeral_disk` | Running on Vercel, where only `/tmp` is writable and it does not survive |
| `directory_not_writable` | `STORAGE_DIR` could not be created or written to |
| `sqlite_unavailable` | `node:sqlite` is missing — Node older than 22.5 |

`location` is a filename, never an absolute path: this is an HTTP response.

---

## `GET /api/audits`

Everything the server has stored for **your** session, identified by the
`uxa_session` cookie. No cookie means an empty list — it never creates a session
just because someone looked.

```json
{
  "audits": [
    {
      "id": "dd245044-5e3a-4b49-b1c0-05c2e5975b6f",
      "url": "https://example.com/",
      "score": 70,
      "language": "en",
      "createdAt": "2026-08-31T22:32:56.457Z",
      "shareId": null
    }
  ],
  "storage": "sqlite",
  "count": 1
}
```

Metadata only, up to 50 entries. The full report is fetched by its share link.

### What is stored, and what is not

**Stored:** the audited URL, the report (including the evidence snippets, which
come from a public page), and a random anonymous session id.

**Not stored:** the downloaded HTML, the screenshot, IP addresses, user agents —
nothing that identifies a person. The `audits` table has exactly eight columns
and none of them is a request header.

---

## `DELETE /api/audits`

Deletes everything stored for this session and clears the session cookie. Any
share links belonging to it stop resolving immediately.

```json
{ "deleted": 1 }
```

This is the erasure path, and it needs no account because there is no account.

---

## `POST /api/audits/{id}/share`

Publishes a stored audit at its own URL. Requires the session cookie, and only
works on an audit belonging to that session.

```json
{ "shareId": "96c49e548e38498ba41e76", "path": "/a/96c49e548e38498ba41e76" }
```

The share identifier is generated separately from the internal id, so a shared
link reveals nothing that can be used elsewhere. Calling it twice returns the
same link. An audit that is not yours returns `404`, not `403` — confirming it
exists would already leak something.

Shared pages are served with `robots: noindex`: an unlisted link is not the same
as published content.

## `DELETE /api/audits/{id}/share`

Revokes the link. The audit itself is untouched; the URL starts returning `404`.

```json
{ "shared": false }
```

---

## `GET /api/keys` · `POST /api/keys` · `DELETE /api/keys/{id}`

API key management. Gated by `ADMIN_TOKEN`.

```bash
curl -X POST https://your-deploy/api/keys   -H "Authorization: Bearer $ADMIN_TOKEN"   -H 'Content-Type: application/json'   -d '{"label":"ci-pipeline","quota":500}'
```

```json
{
  "key": { "id": "41a41d55-…", "label": "ci-pipeline", "quota": 500, "used": 0, "remaining": 500 },
  "secret": "uxa_7b05e099333e4a9fb67e7c36d111abb453f9f1ed",
  "warning": "Store this now. It is hashed and cannot be recovered."
}
```

`secret` appears exactly once, in this response. Only its SHA-256 is stored, so
a stolen database yields no usable keys, and `GET /api/keys` never returns the
hash either. Lose the secret and the fix is to revoke and create another.

`DELETE /api/keys/{id}` marks a key revoked rather than deleting the row: the
row is the record that the key existed and how much it was used.

| Field | Notes |
|---|---|
| `label` | Required, trimmed to 60 chars |
| `quota` | Optional, defaults to 100, capped at 10 000 |

---

## `GET /api/errors` · `DELETE /api/errors`

The last 100 server errors, newest first. Gated by `ADMIN_TOKEN`.

```json
{ "errors": [{ "id": "…", "event": "audit_unexpected_error", "message": "…", "createdAt": "…" }], "count": 1, "storage": "sqlite" }
```

Deliberately small: a bounded ring, no aggregation, no alerting. It is not a
replacement for an error-tracking service — it answers "what broke on the
deployment?" without needing shell access or an account anywhere.

It stores the error message and nothing about the request: no URL, no IP, no
headers. An error store is exactly where personal data ends up leaking by
accident.

`?limit=` caps the number returned (max 100). `DELETE` empties it.
