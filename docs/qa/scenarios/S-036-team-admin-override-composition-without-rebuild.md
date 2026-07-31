---
id: S-036
title: Team Admin — Override Composition Without Rebuilding
persona: team-admin
priority: P0
automation: e2e-done
e2e: e2e/deploy/config-override/test.sh
---

## Goal

An admin needs different adapters than the image's baked default (their own
Redis, their own storage backend) but has no access to the monorepo and does
not want to build a custom image. They mount a config file over the
container's live config path and the container picks it up — the core value
proposition of ADR-0037 ("composition is injected, not baked").

---

## Prerequisites

- [ ] Docker installed, daemon running
- [ ] A published (or locally built) service image
- [ ] A `kb.config.json` naming the admin's own adapters

---

## Steps

### Phase 1 — Mount wins over the baked default

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `docker run -v ./my-kb.config.json:/app/.kb/kb.config.json:ro <image>` | Starts using the mounted config, not the image's baked default | | ⬜ |
| 2 | Change an adapter in the mounted file, restart the container (no rebuild) | New adapter takes effect immediately | | ⬜ |

### Phase 2 — Partial override (lock still needs the package)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 3 | Mount a config naming an adapter whose package is NOT in the image's `node_modules` | Container starts (config accepted) but the specific adapter fails to load | | ⬜ |
| 4 | This is caught before deploy, not discovered here | Confirm `kb-create validate --lock <image's lock>` on the same config fails first — see [S-037](S-037-team-admin-catch-broken-composition-before-deploy.md) | | ⬜ |

---

## Result

<!-- PASS / FAIL / PARTIAL -->

## Bugs

## Notes

- Same e2e as [S-035](S-035-team-admin-try-container-five-minutes.md) — one
  fixture, two scenarios (no-mount vs. mounted-override are separate
  assertions in the same test run).
- Phase 2 is the honest limit of "no rebuild": a mounted config can only
  select among adapters whose *packages* are already in the image. Swapping
  to a genuinely new adapter is the "bake your own" flavor-image path
  (plan Phase 3), not a runtime override — see ADR-0037's packaging table.
