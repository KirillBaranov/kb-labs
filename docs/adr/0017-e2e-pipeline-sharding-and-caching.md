# ADR-0017: E2E pipeline sharding and incremental caching

**Date:** 2026-05-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-05-18
**Reviewers:** —
**Tags:** ci, e2e, performance, testing

## Context

E2E Platform Tests on main take ~22 min wall-clock per push (baseline run [`26000866859`](https://github.com/KirillBaranov/kb-labs/actions/runs/26000866859), 2026-05-17). Per-step breakdown from the GitHub Actions API:

| Step | Duration | Share |
|---|---:|---:|
| Setup (checkout, Go, pnpm, Node, build Go tools, pnpm install) | 46s | 4% |
| **Build all packages (170 TS workspaces, topological)** | **461s** | **35%** |
| Install Playwright browsers | 25s | 2% |
| Pack @kb-labs/* packages → tgz | 75s | 6% |
| Docker buildx cache restore | 44s | 3% |
| Build platform + publisher images | 75s | 6% |
| Verdaccio up + healthcheck | 13s | 1% |
| **Publish ~25 packages to Verdaccio** | **162s** | **12%** |
| Platform `kb-dev start` + /ready | 55s | 4% |
| **Run e2e tests (8 suites sequentially)** | **279s** | **21%** |
| Cleanup, artifacts, post-cache | ~100s | 8% |
| **Total wall-clock** | **~21:42** | 100% |

Three long poles dominate: build (35%), tests (21%), publish (12%). Optimizing only the test execution gives at most −21% wall-clock; real progress needs to attack build and publish in parallel.

Previous projects from team members have seen pipelines like this grow to 60+ min while change density stayed the same. The pipeline is currently green and stable — the right moment to invest in scaling before the threshold becomes painful.

### Constraints

- GH-hosted runners, public OSS — unlimited GitHub Actions minutes, wall-clock is the cost function we optimize.
- `Platform E2E` is a required check for merge — the single-status-check semantics must be preserved (branch protection rules must not break).
- No re-architecting of kb-devkit, kb-create, or platform Docker image internals.

### Alternatives considered

1. **Self-hosted runners with persistent storage.** Adds infra burden (provisioning, security, scaling) for what is essentially a linear speedup. Not justified at current volume.
2. **Test impact analysis** — map source changes to affected tests via coverage instrumentation. Requires stable tracing infrastructure across the monorepo; premature.
3. **Smart caching + matrix sharding on existing GH-hosted runners.** Chosen.

## Decision

Roll out the optimization in three self-contained phases, with an optional fourth. Each phase validates against `timings.json` instrumentation introduced in Phase 0 before the next phase ships.

### Phase 0 — Timings instrumentation

Add a final `Emit timings` step to `.github/workflows/e2e-platform.yml`. It reads the current run via `gh api /repos/{owner}/{repo}/actions/runs/{run_id}/jobs`, computes per-step durations from `startedAt`/`completedAt`, writes a Markdown table to `$GITHUB_STEP_SUMMARY`, and uploads `timings.json` as an artifact. A companion script `e2e/scripts/compare-timings.sh` diffs two run-ids locally.

Pure observability; no behavioral change. Adds ~5s to the run. Foundation for measuring every subsequent phase.

### Phase 1 — Persist `.kb/devkit/` CAS cache across runs

kb-devkit already stores build outputs in a content-addressable store at `.kb/devkit/objects/`. The cache is per-task and works within a single runner; across runs it is lost. Add `actions/cache@v4` keyed on `pnpm-lock.yaml`, `devkit.yaml`, and `tsconfig*.json` so a warm runner restores `dist/` from CAS for packages whose inputs are unchanged.

**Expected effect on "Build all packages":** 461s → 30–60s on a typical PR; ~10s on a docs-only PR; 461s unchanged on a cold cache (lockfile changed).

### Phase 2 — Cache packed `.tgz` + skip warm publish

Cache `e2e/packages/` with `actions/cache@v4` keyed on `**/dist/**` + `**/package.json` hash. Wrap the "Publish packages to Verdaccio" step in a guard that skips it when the .tgz cache is warm and the Verdaccio storage volume contains the expected snapshot.

**Expected effect:** pack 75s → ~3s warm; publish 162s → ~5s warm.

### Phase 3 — Matrix sharding with `build-once, test-many`

Restructure into three jobs:

- `build` — runs setup through "Publish to Verdaccio". Outputs: `e2e-packages` artifact + `platform-image.tar` via `docker save`.
- `test` — `strategy.matrix.suite` with all 8 e2e suites. Each shard downloads artifacts, `docker load`s the image, starts its own platform stack, and runs exactly one suite via `kb-devkit run e2e --packages @kb-labs/e2e-<suite>`.
- `aggregate` — `needs: test`, `if: always()`. Single required status check (`Platform E2E`) that summarizes the matrix.

**Status checks:** `Platform E2E` (aggregator) stays the single required check. Eight individual `Platform E2E / <suite>` checks are visible but non-required — they let reviewers see which suite failed at a glance and let CI re-run only the failing shard.

**Compute trade-off:** wall-clock takes priority over compute minutes. Eight shards over grouping is fine on public OSS GH-hosted runners.

**Expected wall-clock after all three phases:** ~8–9 min on a warm PR (build job ~5 min + max-shard ~3 min + aggregate ~10s).

### Phase 4 — Affected-only for PRs (deferred)

`kb-devkit run e2e --affected` is implemented but relies on the dependency graph being accurate across plugins → e2e packages. Park this until Phase 1–3 have a month of stability on main.

## Consequences

### Positive

- Wall-clock on a typical PR drops 22 min → 8–9 min (−60%).
- Failure isolation: one bad suite no longer blocks signal from the other seven.
- Re-run only the failing shard, no full pipeline replay.
- `timings.json` makes every run self-documenting and enables trend dashboards.
- The CAS cache and packed-tgz cache also speed up local `pnpm build` and `pnpm e2e` for developers.

### Negative

- Compute minutes grow ~22 → 25–30 per typical PR. Acceptable: public OSS.
- Workflow YAML grows from ~50 to ~150 lines; failure paths are less obvious at first glance.
- Cache-invalidation bugs (stale tgz on coarse hash key). Mitigated by auto-fallback to full repack on cache-miss.
- `docker save`/`docker load` between jobs adds 30–60s per shard.

### Risks

- CAS cache size on `main` can grow to several GB — relies on GH Actions cache eviction (10 GB ceiling per repo).
- Aggregator job (`if: always()`) must correctly fail the check when any matrix shard fails. Validate with deliberate failure injection.

## Implementation

Changes concentrated in `.github/workflows/e2e-platform.yml`. Additional touches:

- `e2e/scripts/pack-all.sh` — `--cache-aware` flag (skip when hash unchanged).
- `e2e/scripts/compare-timings.sh` — new utility script (read-only).
- `e2e/publisher/publish.sh` — early-exit when Verdaccio volume contains the expected snapshot hash.

Not modified:

- `tools/kb-devkit/**` — CAS is already implemented; we rely on the existing `Get`/`PutFile`/`RestoreFile` API in `tools/kb-devkit/internal/cache/store.go`.
- `e2e/docker-compose.yml` — Verdaccio already uses a named volume; we only need to confirm the mount is stable across `docker compose down/up`.

Phase rollout order: 0 → 1 → 2 → 3. Each ships separately, validated against `timings.json`. If real numbers diverge from estimates by >25%, the next phase is re-evaluated before merging.

Revisit after Phase 3 lives one month on main: if shard flake-rate exceeds 2% or wall-clock target isn't met, fall back to fewer shards or fast-track Phase 4.

## References

- [Plan file](../../.claude/plans/tender-strolling-wind.md)
- [ADR-0016: Test Pyramid](./0016-test-pyramid.md) — defines E2E as the top layer this ADR operationalizes
- [Baseline run timings](https://github.com/KirillBaranov/kb-labs/actions/runs/26000866859) — main, all-green, 2026-05-17 19:45 UTC
- [kb-devkit CAS implementation](../../tools/kb-devkit/internal/cache/store.go)

---

**Last Updated:** 2026-05-18
**Next Review:** 2026-06-18 (after Phase 3 reaches main)
