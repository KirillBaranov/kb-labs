---
id: S-035
title: Team Admin — Try KB Labs in a Container Without a Rebuild
persona: team-admin
priority: P0
automation: e2e-done
e2e: e2e/deploy/config-override/test.sh
---

## Goal

An admin with no access to the KB Labs monorepo pulls a published service
image and runs it. It boots successfully with a working default composition
— no config file to author, no adapters to wire up first. This is the "5
minutes to evaluate" claim the whole cloud-delivery plan is built around.

---

## Prerequisites

- [ ] Docker installed, daemon running
- [ ] A published (or locally built) service image

---

## Steps

### Phase 1 — Boot with zero configuration

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `docker run <image>` with no volumes, no env beyond secrets | Container starts, does not crash-loop | | ⬜ |
| 2 | Inspect the live config the process is using | Matches the image's baked default — never a raw `${VAR}` placeholder, never empty | | ⬜ |
| 3 | Hit the service's health endpoint | 200 / healthy | | ⬜ |

### Phase 2 — Re-run doesn't corrupt state

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | Stop and restart the same container (no volumes) | Boots identically — the baked default is applied fresh each time, not accumulated/mutated | | ⬜ |

---

## Result

<!-- PASS / FAIL / PARTIAL -->

## Bugs

## Notes

- Automated via `e2e/deploy/config-override/test.sh`, run:
  `sh e2e/deploy/config-override/test.sh` from repo root (requires Docker).
- **What that e2e proves vs. what this scenario claims:** the e2e test
  exercises the exact, real `docker-entrypoint.sh` shipped in
  `services/gateway/app/` against a minimal fixture app — it proves the
  *packaging mechanism* (baked default applies when nothing is mounted).
  It does not boot a real gateway/rest-api/etc. process end-to-end, because
  that needs `pnpm deploy --prod` artifacts only CI produces today. Full
  real-image coverage is blocked on the same CI gap as
  [S-034](S-034-platform-team-full-image-matrix-published.md).
