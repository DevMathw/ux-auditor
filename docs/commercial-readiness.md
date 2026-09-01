# Commercial readiness

What UX Auditor still needs before it can charge money, and what it deliberately
should not build yet. Written against the current architecture (deterministic
rule engine + optional AI interpretation layer).

Nothing in this document is implemented. It is a specification, because every
item below requires an account, a provider decision, or a legal choice that is
not the engineer's to make alone.

---

## 1. Unit economics — the numbers this rests on

Measured, not estimated (see `docs/measurements.md` for method):

| Path | Latency | Cost per audit |
|---|---|---|
| Deterministic only (no AI) | ~0.4 s | **$0.000** |
| Deterministic + AI layer | 10–20 s | **~$0.015** |
| Cache hit (same page content) | ~0.8 s | **$0.000** |

The deterministic layer costing nothing is the single most important fact for
pricing: **a free tier is genuinely free to serve.** The AI layer is the only
variable cost, and it is bounded by `MAX_TOKENS` and the length limits in the
prompt.

Worked example at 1,000 signups/month, 20% converting to a paid plan:

- 800 free users × 5 deterministic audits = **$0**
- 200 paid users × 40 AI audits = 8,000 × $0.015 = **$120/month**

Gross margin stays healthy well past that point. The cost risk is not the model
price; it is an unauthenticated endpoint being scraped, which is why usage
limits are tied to accounts below rather than to IP addresses.

---

## 2. Classification

### REQUIRED FOR MVP

Without these you cannot legally or safely take money.

| Item | Why it blocks launch | Notes for implementation |
|---|---|---|
| **Authentication** | Usage limits must attach to a person, not an IP. The per-IP limiter is trivially bypassed and resets on every deploy. | Email + OAuth. There is an anonymous session cookie and hashed API keys with quotas today, which is the mechanism — what is missing is an identity behind it: no email, no password, no recovery. |
| **Database** | Users, subscriptions and usage counters must survive a deploy, and must be shared across instances. Audits already persist to SQLite where a disk exists — but not on serverless, and not across instances. | Postgres. The `audits` and `api_keys` tables port over almost unchanged; what is missing is `users`, `usage_periods` and `subscriptions`. |
| **Usage limits per account** | The cost control that makes the free tier safe. | Counter keyed on `(user_id, billing_period)`, checked before the AI layer runs — the deterministic layer can stay unlimited because it is free. |
| **Billing + payment provider** | Obvious. | Stripe Checkout + Customer Portal. Do not build card handling; redirect to Stripe. |
| **Subscription webhooks** | Without them a cancelled card keeps its paid access forever. | `checkout.session.completed`, `customer.subscription.updated`, `.deleted`, `invoice.payment_failed`. Must be idempotent — Stripe retries. |
| **Transactional email** | Password reset and receipts are not optional. | Resend or Postmark. |
| **Terms of Service + Privacy Policy** | Required to take payment and to process third-party URLs. | Must state what is stored, for how long, and that audited pages are fetched by our servers. |
| **Data deletion** | GDPR/CCPA. Also simply correct. | `DELETE /api/audits` already erases everything held for a session and revokes its share links. With accounts it must cascade from the user instead. |
| **Error tracking** | You cannot support a paid product you cannot debug. | `/api/errors` keeps the last 100 errors, which is enough to diagnose but has no alerting, grouping, or stack traces. Sentry or equivalent. |
| **Shared rate limiting** | The current limiter is per-instance and in-memory; on serverless each instance keeps its own count. | Upstash Redis or equivalent. |

### IMPORTANT (weeks 1–8 after launch, not blocking)

| Item | Why |
|---|---|
| **Projects / saved sites** | The difference between a toy and a tool an agency uses weekly. |
| **Server-side audit history** | Prerequisite for re-audit and before/after comparison. The deterministic score makes these meaningful for the first time. |
| **Shareable report URL** | The single strongest growth loop for this product: an agency sends a client a link, the client sees the branding. |
| **Product analytics** | You cannot tune a funnel you cannot see. PostHog or Plausible. |
| **Uptime monitoring** | Paid customers expect a status answer. |
| **Support channel** | An email address that a human reads is enough at first. |
| **Structured logging** | Per-audit: url hash, rules run, AI tokens, cost, latency. Needed to spot cost drift. |
| **Account settings** | Change email, change password, see current plan and usage. |
| **Backups** | Managed Postgres providers do this; verify the restore actually works. |

### NICE TO HAVE (only once paying customers ask)

- Public API with keys
- White-label PDF export for agencies
- GitHub integration / CI check
- Team seats and roles
- Scheduled re-audits with email alerts on regression
- Multi-page crawl (audit a whole site, not one URL)
- Screenshot capture as visual evidence

### NOT NECESSARY YET

- SOC 2 / ISO certification — only when enterprise deals demand it
- Self-hosting / on-premise
- SSO / SAML
- Mobile apps
- Multi-region deployment
- Custom rule authoring by users

---

## 3. Plan structure

Priced around the one thing that actually costs money — the AI layer — while
giving away the thing that costs nothing.

### FREE — "see that it works"

- Unlimited **deterministic** audits (22 checks, evidence, reproducible score, fixes)
- 3 AI-interpretation audits per month
- History kept in the browser only
- No projects, no sharing, no PDF export

The deterministic audit is genuinely useful on its own. That is the honest
version of a free tier, and it costs nothing to serve.

### PRO — for an individual designer or developer

- Unlimited AI audits, fair-use capped
- Projects and server-side history
- Re-audit and before/after comparison
- PDF export
- Shareable report links

The buying trigger is **tracking improvement over time**, which only works
because the score is reproducible.

### AGENCY / TEAM

- Everything in Pro
- Team seats with shared projects
- White-label PDF and shared reports (own logo, own domain)
- Higher fair-use ceiling
- API access

The buying trigger is **client deliverables**. An agency is not paying for the
audit; it is paying to hand a client a branded report.

### What justifies paying, in one line each

| Feature | Why someone pays |
|---|---|
| Unlimited AI audits | Volume of real work |
| Projects + history | Managing more than one site |
| Before/after comparison | Proving to a client that the work landed |
| White-label reports | Reselling the output |
| API | Putting it in CI |

### What must never be paywalled

The evidence behind a finding. A score without its evidence is the thing that
makes people distrust AI tools; charging for the evidence would make the free
tier actively misleading.

---

## 4. Abuse and cost control

Layered, cheapest check first:

1. **Content-hash cache** (implemented) — a repeated audit of an unchanged page costs nothing.
2. **SSRF guard** (implemented) — blocks using the service as an internal-network probe.
3. **Size cap + content-type check** (implemented) — bounds the work per request.
4. **Per-IP rate limit** (implemented, in-memory) — must move to a shared store.
5. **Per-key quota** (implemented) — hashed API keys with a 24 h quota window and revocation. This is the real control; what is missing is an *account* behind the key, not the metering.
6. **Bounded model output** (implemented) — `MAX_TOKENS` plus explicit word limits in the prompt; cost per audit cannot run away.
7. **Deterministic fallback** (implemented) — if the AI layer fails, the user still gets a complete audit, so a failed call never produces a refund request.

Not yet covered: a signed-up user scripting the authenticated endpoint. Per-account
quotas plus a concurrency cap per user close it.

---

## 5. Suggested build order

1. Postgres + auth + sessions (nothing else can land first)
2. Move history server-side; keep `localStorage` as the anonymous path
3. Per-account usage metering on the AI layer
4. Stripe Checkout + webhooks + Customer Portal
5. Terms, Privacy, account deletion
6. Sentry + shared rate limiting
7. Projects, re-audit, before/after comparison
8. Shareable report URLs
9. White-label export
