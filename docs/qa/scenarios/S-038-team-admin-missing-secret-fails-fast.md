---
id: S-038
title: Team Admin — Missing Secret Fails Fast Instead of Booting Broken
persona: team-admin
priority: P0
automation: e2e-todo
e2e: core/runtime/src/__tests__/config-loader.test.ts
---

## Goal

An admin deploys a service and forgets to set a required secret
(`GATEWAY_JWT_SECRET`, `OPENAI_API_KEY`, etc.), referenced in config as
`${VAR}`. In production, the process refuses to start with a clear error
naming the missing variable — it never boots "successfully" with a literal
`${VAR}` string baked into its live config and fails mysteriously on first
real request instead.

---

## Prerequisites

- [ ] A config with a `${VAR}` placeholder for a required value
- [ ] `NODE_ENV=production` set (as every shipped image does)

---

## Steps

### Phase 1 — Missing variable in production mode

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Start the service with the referenced env var unset, `NODE_ENV=production` | Process exits non-zero at boot, error names the missing variable | | ⬜ |
| 2 | Set the variable, restart | Boots normally | | ⬜ |

### Phase 2 — Same scenario outside production (dev ergonomics preserved)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | Same missing variable, `NODE_ENV` unset/`development` | Boots anyway, with a logged warning and the literal `${VAR}` left in place (fails lazily at first use, not at boot) | | ⬜ |

---

## Result

<!-- PASS / FAIL / PARTIAL -->

## Bugs

## Notes

- **Mechanism-level coverage exists and passes** —
  `core/runtime/src/__tests__/config-loader.test.ts` has
  `'throws on an unresolved ${VAR} placeholder when NODE_ENV=production'`
  (confirmed to fail before the fix, pass after — see commit history) and
  `'leaves an unresolved ${VAR} placeholder intact outside production'` for
  Phase 2. Run: `pnpm --filter @kb-labs/core-runtime run test -- config-loader.test.ts`.
- **Not yet proven at container level** — booting a real published image
  with a secret withheld and observing the actual exit code/log line needs a
  real built image, same CI gap as [S-034](S-034-platform-team-full-image-matrix-published.md).
  Marked `e2e-todo` rather than `e2e-done` for that reason, even though the
  underlying logic is fully tested.
