# UX audit in CI

Gate a pull request on a UX score.

```bash
cp ux-audit.yml ../../.github/workflows/
```

Then set `TARGET_URL` to the site you want to watch, and adjust
`MIN_ACCESSIBILITY` / `MIN_OVERALL`.

## Why a threshold works here

Because the score is deterministic. The same page always produces the same
number, so a threshold means something. Against a tool where a language model
picks the score, a 5-point gate would fail builds at random — the reason this
integration exists at all is the rule engine.

See [`docs/measurements.md`](../../docs/measurements.md#score-reproducibility)
for the measurement.

## What it will not do

- **It does not gate on low-confidence audits.** If the target is a
  client-rendered shell and the auditor could not see the real page, the
  workflow warns and passes. Failing a build on data the tool itself flags as
  unreliable would be worse than not checking.
- **It does not gate on AI observations.** Those are not reproducible, so they
  never affect the score. They appear in the summary as context only.
- **It does not guarantee the visual rules ran.** Check `rendered` in the
  output; when it is `false`, contrast, type size and tap targets were skipped.
  `GET /api/health` on the auditor tells you whether that deployment can render
  at all.

## Rate limits

The public instance allows 10 audits per 5 minutes per IP. A busy repository
should self-host the auditor rather than lean on it.

## Output

The workflow writes a summary to the job page and uploads `audit.json` — the
full typed `AuditResult`, documented in [`docs/api.md`](../../docs/api.md).
