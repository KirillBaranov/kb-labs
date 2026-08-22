---
id: S-037
title: Team Admin — Catch a Broken Composition Before Deploying
persona: team-admin
priority: P0
automation: e2e-done
e2e: tools/kb-create/v2/catalog/load_test.go
---

## Goal

An admin writes a composition file by hand (or copies one from docs) and
gets a typo or a wrong adapter reference wrong. They find out from a failed
`kb-create validate` command with a specific, actionable message — not from
a container that reports healthy and then fails the first real request.

This is the same underlying command as [S-033](S-033-platform-team-composition-validated-before-ship.md);
that scenario is the team using it as a CI gate before publishing, this one
is an admin using the same tool before their own deploy.

---

## Prerequisites

- [ ] `kb-create` binary available
- [ ] A composition file the admin is about to deploy

---

## Steps

### Phase 1 — Typo in an adapter slot name

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Admin writes `"cach": "@kb-labs/adapters-redis"` (typo for `"cache"`) | `kb-create validate` fails, names `"cach"` as unrecognized, suggests checking for a typo | | ⬜ |
| 2 | Fix the typo, re-run | Passes | | ⬜ |

### Phase 2 — Adapter package not in the image

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | Admin references an adapter their chosen image doesn't ship | `kb-create validate --lock <the image's lock file>` fails, names the specific slot and package, states it "will not load at boot" | | ⬜ |
| 4 | Admin picks a different, shipped adapter instead | Passes | | ⬜ |

---

## Result

<!-- PASS / FAIL / PARTIAL -->

## Bugs

## Notes

- Covered by V2 release-index/catalog validation tests.
  (`TestValidate_UnknownSlot_Errors`, `TestValidate_LockCrossCheck_MissingPackage`).
  Run: `go test ./internal/validate/...` from `tools/kb-create/`.
- An admin won't usually have a service's `marketplace.lock` on hand unless
  it's published alongside the image (Phase 4 of the delivery plan —
  publishable compose/Helm artifacts). Until then, Phase 2 here is only
  practical for the team itself (S-033), not yet a smooth admin workflow —
  flagged as a gap, not silently assumed solved.
