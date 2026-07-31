---
id: S-034
title: Platform Team — Full Image Matrix Published on Release
persona: platform-team
priority: P0
automation: manual
e2e: —
---

## Goal

Every backend unit (`state-daemon`, `gateway`, `marketplace`, `marketplace-registry`,
`rest-api`, `workflow`, `mcp`, `studio`) has a published, correctly-tagged image
after a release, built from the same artifact the team would ship to a
customer — not four services covered and four silently missing.

---

## Prerequisites

- [ ] Dockerfiles exist for all 8 units (done — see
      `docs/plans/2026-07-31-cloud-deployment-overhaul.md` Phase 2)
- [ ] CI build matrix wired for all 8 (**not done** — see Notes)
- [ ] `.kb/deploy.yaml` / `deploy.yml` extended to the full set (**not done,
      deliberately blocked** — see Notes)

---

## Steps

### Phase 1 — Per-service image builds

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | CI builds `pnpm deploy --prod` artifacts for all 8 services | 8 `.kb/deploy/<name>/` dirs produced | | ⬜ |
| 2 | CI builds a Docker image per service | 8 images built, no build failures | | ⬜ |
| 3 | Each image is tagged with the release version (not `latest`) | `docker inspect` shows the release tag | | ⬜ |

### Phase 2 — Publish

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | Images pushed to `ghcr.io/kb-labs-team/` | All 8 present at the new tag | | ⬜ |
| 5 | Pre-publish gate: `kb-create validate` runs against each service's baked default composition | Fails the release if any service's default config references a package missing from its lock | | ⬜ |

### Phase 3 — Deploy the full set

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | `docker compose -f infra/docker-compose.backend.yml up` with the new tag | All 8 containers start | | ⬜ |
| 7 | `marketplace-registry` waits for `state-daemon` to be healthy | No crash-loop on cold start (dependency ordering) | | ⬜ |
| 8 | `workflow` never runs more than 1 replica | Compose `deploy.replicas: 1` enforced; scaling it up is a visible, deliberate override, not an accident | | ⬜ |

---

## Result

<!-- PASS / FAIL / PARTIAL -->

## Bugs

## Notes

- **Deliberately not automated yet.** `.kb/deploy.yaml` targets point
  `remote.compose_file` at a hand-placed file on the real production VPS
  (`~/kb-labs/docker-compose.backend.yml`), not the in-repo
  `infra/docker-compose.backend.yml`. Wiring new CI targets before that
  remote file has matching services would break the live production deploy
  job for `gateway`/`marketplace-registry` on the next push. See task
  "BLOCKED: wire 6 new services into .kb/deploy.yaml + deploy.yml" in the
  cloud-deployment plan.
- Today only `kb-gateway` and `kb-marketplace-registry` are actually built
  and published by CI. This scenario documents the target state; run it
  manually against a real release once the CI matrix (Phase 2, step 3 of the
  plan) and the remote-host update land.
