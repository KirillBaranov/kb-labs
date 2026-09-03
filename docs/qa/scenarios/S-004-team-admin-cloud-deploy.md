---
id: S-004
title: Team Admin — Cloud Deploy
persona: team-admin
priority: P0
automation: manual
e2e: —
---

## Goal

Admin deploys the KB Labs platform to a remote VPS from scratch using `kb-deploy apply`.
Platform should be reachable at the configured domain, all services healthy, Studio login works.

## Prerequisites

- [ ] `kb-deploy` binary installed (`kb-deploy --version`)
- [ ] SSH access to target host (key-based, no password)
- [ ] `deploy.yaml` configured with target host and services
- [ ] Domain/IP for the platform (e.g. `kblabs-cloud.kblabs.ru`)
- [ ] Target host: Node 24+, pnpm 9+, 2GB+ free disk, 1GB+ free RAM
- [ ] Ports 80/443 open on target host (or direct ports 3000/4000/5050)

---

## Steps

### Phase 1 — Pre-flight

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb-deploy --version` | Prints version | | ⬜ |
| 2 | `cat .kb/deploy.yaml` | Shows correct host, services list, registry config | | ⬜ |
| 3 | `kb-deploy validate` (if exists) | Config valid, no errors | | ⬜ |
| 4 | SSH to host: `df -h` | ≥ 3 GiB free disk (deploy guard floor) | | ⬜ |

### Phase 2 — Deploy

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 5 | `kb-deploy apply` | Build → reclaim → bootstrap → publish → apply → smoke | | ⬜ |
| 6 | Each phase completes without error | No FAIL lines in output | | ⬜ |
| 7 | Smoke checks pass: gateway, rest-api, workflow, studio all 200 | Output confirms 4/4 healthy | | ⬜ |

### Phase 3 — Verify platform is live

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 8 | `curl https://<domain>/health` | HTTP 200, `status: ok` from gateway | | ⬜ |
| 9 | `curl https://<domain>:5050/health` | HTTP 200 from rest-api | | ⬜ |
| 10 | Open Studio in browser `https://<domain>:3000` | Studio UI loads | | ⬜ |
| 11 | Login with admin credentials | Login succeeds, dashboard visible | | ⬜ |

### Phase 4 — Re-deploy (idempotency)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 12 | Run `kb-deploy apply` a second time with no config changes | Detects no drift, skips or fast-paths services | | ⬜ |
| 13 | Services still healthy after re-deploy | All smoke checks still green | | ⬜ |

### Phase 5 — Rollback

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 14 | `kb-deploy rollback` (or `kb-create rollback`) | Previous release activated | | ⬜ |
| 15 | Services healthy on previous release | Smoke checks pass | | ⬜ |

---

## Result

<!-- PASS / FAIL / PARTIAL -->

## Bugs

## Notes

- TD-13 confirmed this flow works end-to-end as of 2026-06-05 on `kblabs-cloud.kblabs.ru`
- Known: each build generates new content-id → 4 installs per deploy (no skip optimisation yet)
- Known: `deploy.yaml` services block still legacy — declarative services not yet configured
