# Interview preparation

Twenty-one questions this project genuinely invites, every one tied to a real
decision in the code. No question here is about a feature that does not exist.

For each: what the interviewer is actually probing, the answer, where the
evidence is, and the trade-off you should volunteer before they find it.

---

## Architecture and AI

### 1. Why not just let the model do the whole audit? It would be less code.

**Probing:** whether you can justify complexity, or just like building engines.

**Answer:** I tried that first — it was the original design. I measured it:
the same page audited three times returned 48, 48, 45, with a different number
of findings each run. That kills three things at once. Re-audit is meaningless,
before/after comparison cannot distinguish a fix from noise, and a user who
refreshes and sees a different number stops trusting the tool. Rules are more
code, but they buy reproducibility, and reproducibility is the product.

**Evidence:** `docs/measurements.md` § Score reproducibility ·
`tests/run-audit.test.ts` → *"la IA NUNCA altera la puntuación"*

**Trade-off:** 27 hand-written rules are a maintenance surface, and they only
cover what is expressible as a rule. That is exactly why the AI layer still
exists — it does the part rules cannot.

---

### 2. So what does the model actually add?

**Probing:** whether the AI is decoration.

**Answer:** It reads the rendered screenshot and the page copy and judges what
the markup cannot express. On Hacker News it returned *"every headline shares the
same size and weight, with no distinction between the first and the twentieth"*
— no parser produces that. It writes the summary and adds observations, and it
is the only part that can tell you your headline says nothing.

**Evidence:** `app/lib/buildPrompt.ts` · `app/lib/runAudit.ts` →
`applyInsightLayer`

**Trade-off:** its output is not reproducible, so it is excluded from the
before/after comparison entirely (`app/lib/compare.ts`). Including it would
produce phantom fixes and regressions.

---

### 3. How do you stop the model from inventing findings?

**Probing:** hallucination handling.

**Answer:** Every AI observation must include a verbatim quote from the page.
`normalizeInsights()` drops any insight with an empty quote before it reaches the
report. So an unsupported claim cannot become a finding without also being
visible as a quote the user can check against the page.

**Evidence:** `app/lib/auditSchema.ts` → `normalizeInsights` ·
`tests/run-audit.test.ts` → *"descarta observaciones de IA sin cita"*

**Trade-off:** legitimate observations about layout — which have no quotable
text — are harder to express. The prompt allows a factual description of what is
on screen as the quote, which is a compromise, not a clean solution.

---

### 4. Walk me through what happens when the model call fails in production.

**Probing:** whether you designed for failure or hoped.

**Answer:** Nothing user-facing breaks. `applyInsightLayer` catches everything —
timeout, 5xx, malformed JSON — logs it, and returns. The audit falls through to
`buildDeterministicSummary()` and ships with `aiEnabled: false`, which the UI
surfaces as a notice. The user gets a complete report with a score, findings,
evidence and fixes; they just lose the narrative.

**Evidence:** `app/lib/runAudit.ts` · `tests/run-audit.test.ts` →
*"degrada a informe determinista si el modelo falla"* and *"si el modelo
devuelve JSON inválido"*

---

## Security

### 5. Explain your SSRF defence. Why is checking the hostname not enough?

**Probing:** depth, not vocabulary.

**Answer:** A hostname tells you nothing — an attacker controls their own DNS
and can point `evil.com` at `127.0.0.1`. So `isPublicTarget()` resolves the
hostname and requires **every** returned address to be public, rejecting the
request if even one is private. It covers loopback, `10/8`, `172.16/12`,
`192.168/16`, CGNAT `100.64/10`, link-local `169.254/16` — which is where cloud
metadata lives — multicast, and the IPv6 equivalents including `::ffff:` mapped
addresses.

**Evidence:** `app/lib/fetchPage.ts` · `tests/ssrf.test.ts`, 35 tests with
mocked DNS

---

### 6. What about DNS rebinding? You resolve, then fetch — the answer can change in between.

**Probing:** whether you know the limits of your own defence. **Volunteer this
before they ask.**

**Answer:** That is a real gap and I have not fully closed it. What is
implemented is the *multi-answer* case: if a lookup returns both a public and a
private address, the request is rejected rather than accepting the public one.
The remaining TOCTOU window — resolve public, then the second lookup during the
actual connection returns private — would need pinning the resolved IP and
connecting to it directly with the Host header preserved, which means a custom
agent. Given that this is a public read-only tool with no internal network worth
reaching, I judged the cost higher than the risk, but it is the next thing I
would do if this ran inside a VPC.

**Evidence:** `tests/ssrf.test.ts` → *"bloquea si UNA de varias direcciones es
privada"*

---

### 7. You render arbitrary pages with Playwright. Doesn't that reopen the SSRF hole?

**Probing:** whether you thought past the obvious layer.

**Answer:** It did, and I caught it while reviewing my own change. The HTTP
fetcher was hardened, but a rendered page runs its own JavaScript and can call
`fetch('http://169.254.169.254/…')` from inside the browser — our own browser,
on our own network. So every browser request now goes through `page.route()` and
is checked with the *same* `isPublicTarget()` function. I verified it with a
local page that loads an image from loopback and tries to exfiltrate it: zero
requests reached the internal server, and public sites still render normally.

**Evidence:** `app/lib/render.ts` → the `page.route` handler ·
`docs/measurements.md` § Security of the rendering layer

---

### 8. Why is Chrome's sandbox configurable? Isn't that a foot-gun?

**Answer:** My first draft passed `--no-sandbox` unconditionally because that is
what every serverless tutorial does. That is backwards: the sandbox is the main
defence while executing third-party JavaScript. It is now on by default and
disabled only via `PLAYWRIGHT_NO_SANDBOX=1`, for hosts without user namespaces
where Chromium genuinely cannot start otherwise.

**Evidence:** `app/lib/browserProvider.ts` → `FORCE_NO_SANDBOX`

---

### 9. Your CSP still has `style-src 'unsafe-inline'`. Why did you stop there?

**Probing:** whether you understand CSP or copied a config.

**Answer:** Because nonces do not apply to `style=` attributes — only to
`<style>` elements — and this UI uses inline style attributes heavily. Removing
it would mean either `'unsafe-hashes'`, which is worse, or rewriting the entire
presentation layer. The risk it leaves is low: a style attribute cannot execute
JavaScript. Meanwhile `script-src` has no `'unsafe-inline'` at all — it uses a
per-request nonce with `strict-dynamic`, which is where the actual XSS risk was.

**Evidence:** `proxy.ts` · `tests/csp.test.ts`

**Trade-off:** nonces require dynamic rendering, so `/` is no longer statically
prerendered. I measured the cost: TTFB 12 ms → 21 ms, FCP and LCP unchanged.

---

### 10. How do you handle prompt injection from an audited page?

**Answer:** Three layers. The page content is fenced in the prompt and
explicitly labelled untrusted with an instruction never to follow directives
inside it. The output is constrained by a JSON schema, so the model cannot
return arbitrary shapes. And the quote requirement means an injected instruction
cannot become a finding without appearing as a visible quote. On `/api/explain`
the inputs are additionally length-capped, stripped of control characters, and
`category`/`severity` are validated against allow-lists rather than passed
through.

**Evidence:** `app/lib/buildPrompt.ts` · `app/api/explain/route.ts`

---

## Infrastructure

### 11. Does Playwright actually work on Vercel? Be specific.

**Probing:** whether your README is honest. **This is the question to be most
careful with.**

**Answer:** The `serverless` provider is implemented but **I have not verified
it on a real Vercel deploy** — that needs an account I did not have. What I can
tell you is the budget problem I measured: a full audit takes ~28 s locally and
up to 58 s cold, and `@sparticuz/chromium` adds 3-8 s of decompression on a cold
instance against Vercel's 60 s ceiling. That is unreliable. So the recommended
production path is the `remote` provider — a hosted browser over CDP — which
moves both the cold start and the third-party JavaScript execution off our
runtime. And `/api/health` reports which provider actually resolved, so you can
tell from outside whether visual rules are running.

**Evidence:** `app/lib/browserProvider.ts` · `docs/measurements.md`
§ Serverless rendering · `app/api/health/route.ts`

---

### 12. Why is `@sparticuz/chromium` not a dependency?

**Answer:** It is ~50 MB and only needed on runtimes without a browser. Making
it required would penalise every local install and every CI run for something
most consumers never use. It is loaded through a dynamic import with a
non-literal specifier, so neither TypeScript nor the bundler tries to resolve it
at build time, and its absence is a normal state the provider handles.

**Evidence:** `app/lib/browserProvider.ts` → `SERVERLESS_CHROMIUM_MODULE`

---

### 13. Your cache and rate limiter are in-memory `Map`s. Isn't that broken on serverless?

**Probing:** whether you know your own limits.

**Answer:** They are per-instance, yes. For the cache that is a cost
optimisation, not correctness — a miss just means doing the work again. For the
rate limiter it means the effective limit is `10 × instances`, so I document it
as a cost control, not a security boundary; a real quota has to be tied to an
account, not an IP. The fix is a shared store, and I deliberately did not build
it: it needs a provider account, and the honest in-memory version with a
documented limitation is better than an untested Redis integration.

**Evidence:** `app/lib/rateLimit.ts` · `docs/commercial-readiness.md`

---

### 14. Why cache on content hash rather than URL?

**Answer:** Because the URL is not what determines the report — the content is.
Hashing the HTML means a page that has not changed returns the identical report
without paying for the model call, and a page that *has* changed is never served
stale. The key also includes the selected checks, the language, and whether AI
and rendering were used, because a report with visual rules is not the same
report as one without.

**Evidence:** `app/lib/auditCache.ts` · `tests/audit-cache.test.ts`

---

### 15. Where would this break under load?

**Answer:** The browser. Every audit launches a Chromium instance for 5-15 s;
at any real concurrency you exhaust memory long before you exhaust CPU. That is
the strongest argument for the remote-browser provider — it turns a per-instance
resource problem into someone else's pool. The AI layer is bounded by
`max_tokens` and explicit word limits in the prompt, so cost per audit cannot
run away; the deterministic layer is pure CPU on parsed HTML and is not the
bottleneck.

---

## Engineering practice

### 16. How do you know your rules aren't producing noise?

**Probing:** calibration thinking.

**Answer:** I ran them against sites with known-good and known-bad markup.
`w3.org/WAI` — published by the body that writes WCAG — scores 100 with all 27
rules. Hacker News scores 55, correctly: no `h1`, no `main`, no landmarks, an
unlabelled search field. The spread is meaningful rather than everything
clustering at 90.

Calibration also found three false positives, all now covered by tests so they
cannot come back: links labelled by SVG `aria-label` counted as unlabelled, an
`aria-hidden` decorative H1 counted as a duplicate, and — the structural one —
pages getting credit for rules that did not apply to them, which made a nearly
empty page score 80.

**Evidence:** `docs/measurements.md` § Rule engine calibration ·
`tests/rules.test.ts`

---

### 17. Explain the scoring formula and why applicability matters.

**Answer:** Per category, `100 × (1 − penalties incurred / penalties possible on
this page)`. Each rule declares a max penalty and an `applies()` predicate;
rules that do not apply are removed from **both** sides of that fraction.

Without that, a page with no images gets credit for "all images have alt text" —
it scores well for what it does not have. That was a real bug: `example.com`
scored 80 before applicability, 66 after, which is the more honest number.

**Evidence:** `app/lib/rules/index.ts` → `runRules` ·
`app/scoring/page.tsx` (the public explanation)

---

### 18. How do you keep the public rules documentation from going stale?

**Answer:** The `/scoring` page is generated from `ALL_RULES` and `RULE_DOCS` —
there is no hand-written list. And two tests assert that every registered rule
has documentation and that no documentation is orphaned, so adding a rule
without documenting it fails CI.

**Evidence:** `app/scoring/page.tsx` · `tests/rules.test.ts` §
*documentación de reglas*

---

### 19. What does dependency injection buy you in `runAudit`?

**Probing:** whether the abstraction earns its place.

**Answer:** It makes every degradation path testable. `runAudit` takes
`fetchPage`, `render`, `renderAvailable` and `createMessage` as arguments, so the
tests exercise the real orchestration — model failure, malformed model JSON,
render failure, cache hits, SSRF rejection — with no network, no browser and no
API calls. That is 22 integration tests running in under a second.

Before the extraction all of that logic lived in the route handler and could
only be tested by fabricating a `NextRequest` and mocking modules.

**Evidence:** `app/lib/runAudit.ts` → `AuditDeps` · `tests/run-audit.test.ts`

The same argument applies to the component tests: `AuditWorkspace` is tested by
stubbing `fetch`, so the loading, error, cache-notice and cancellation paths are
all exercised against the real component rather than a mock of it.

---

### 20. Tell me about a bug your tests caught that you would never have found by reading the code.

**Probing:** whether your tests are real or decorative.

**Answer:** The Cancel button ignored real clicks. Under `dispatchEvent` it
worked, so every jsdom component test passed — but a trusted click did nothing.

Diagnosing it took ruling things out in order: the click *did* reach the button
and bubble to `document`; the node carried a valid React fiber whose props
included `onClick` as a function; it was enabled and nothing overlapped it;
`force: true` made no difference; the `:active` transform was not the cause.

What it turned out to be: React rendered the submit button and the cancel button
at the same JSX position, so reconciliation kept **one DOM node** and mutated its
`type` and handlers in place. The reused node stopped receiving trusted clicks.
Giving each branch its own `key` makes React create a fresh node, and it works.

**Evidence:** `app/components/AuditForm.tsx` → the `key="submit"` / `key="cancel"`
comment · `docs/measurements.md` § Two bugs the tests found

**Why it matters:** it is the clearest justification in this project for E2E
existing at all. jsdom dispatches synthetic events, so no unit or component test
could have caught it — and the failing path was the one every real user takes.

---

### 21. What would you do next, and what did you deliberately not build?

**Probing:** judgement and honesty.

**Answer:** Next, in order: verify the serverless browser path on a real deploy,
because it is the one claim in the README I cannot personally confirm; then a
shared store for cache and rate limiting.

Deliberately not built: Redis, PostgreSQL, auth, billing, API keys, multi-page
crawl and drift monitoring. Every one needs an account or answers demand that
does not exist yet. They are specified in `docs/commercial-readiness.md` with a
build order — I would rather ship a smaller thing that is honestly documented
than a larger one where half the features are stubs.

**The one I would push back on:** building auth and billing before the product
was worth paying for. Six months ago this was a wrapper around a model call.
Adding Stripe to that would have been building a toll booth on a road nobody
wanted to drive.

---

## Fast recall

Numbers worth knowing cold, because they will be asked:

| Fact | Value |
|---|---|
| Rules | 27 — 22 markup, 5 rendered |
| Tests | 246 unit (170 domain, 76 component) + 14 E2E. No network |
| Cost per audit | ~$0.016 with AI, $0 without |
| Screenshot cost | ~$0.001 — multimodal is nearly free |
| Audit latency | ~28 s, up to 58 s cold |
| Reproducibility before | 48 / 48 / 45 on identical input |
| Lighthouse desktop | 69 → 98 |
| JS bootup | 1.5 s → 0.3 s |
| CSP nonce cost | +9 ms TTFB |
| Calibration anchor | `w3.org/WAI` scores 100/100 |
| Download cap | 1.5 MB |
| Rate limit | 10 audits / 5 min / IP |

**If you remember one sentence:** the score comes from rules, the model
interprets, and everything else in the design follows from that.
