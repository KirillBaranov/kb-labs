---
id: S-033
title: Platform Team — Composition Validated Before Ship
persona: platform-team
priority: P0
automation: e2e-done
e2e: tools/kb-create/v2/catalog/load_test.go
---

## Goal

Before an image is published, the team catches a broken composition — a config
referencing an adapter package that isn't actually in the deployable artifact,
or a typo'd adapter slot name — as a failed command, not as a service that
boots green and crashes on first use. This is the internal, supply-side half
of ADR-0037: it prevents the exact class of bug PR #328 patched after the
fact (a stale `@kb-labs/adapters-diskio` reference that silently vanished
from the deployed bundle).

---

## Prerequisites

- [ ] `kb-create` binary built (`go build ./tools/kb-create`)
- [ ] A `kb.config.json`-shaped composition file
- [ ] (optional) a `marketplace.lock` for the deployable artifact being checked

---

## Steps

### Phase 1 — Composition with a typo'd adapter slot

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb-create validate <config with "logg3r" instead of "logger">` | Fails, names the unrecognized slot, suggests checking for a typo | | ⬜ |
| 2 | Check exit code | Non-zero | | ⬜ |

### Phase 2 — Composition referencing a package absent from the lock

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | `kb-create validate <config> --lock <lock missing one referenced package>` | Fails, names the specific slot and package, explains it "will not load at boot" | | ⬜ |
| 4 | Fix the lock to include the package, re-run | Passes, "no issues found" | | ⬜ |

## Result

<!-- PASS / FAIL / PARTIAL -->

## Bugs

## Notes

- A release image deliberately has no repo-owned production config or lock.
  The equivalent regression check runs against the bundle emitted by
  `kb-create deployment export` once that command lands.
- **Not covered here:** plugin↔SDK/core peer-version compatibility. No
  manifest field for that exists anywhere in the platform yet — see
  `internal/validate/validate.go`'s doc comment. Validating against a
  nonexistent field would report false confidence, so it deliberately isn't
  attempted.
- **Not yet wired into CI** — this command exists and is tested, but nothing
  in `.github/workflows/deploy.yml` calls it yet as a pre-publish gate. See
  [S-034](S-034-platform-team-full-image-matrix-published.md).
