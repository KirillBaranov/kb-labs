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

## Measurements

### Baseline (Phase 0 only)

| Run | Build | E2E run | Publish | Total |
|---|---:|---:|---:|---:|
| `26003095850` | 422s | 254s | 144s | 1149s |
| `26003358790` | 430s | 256s | 162s | 1193s |

Variance between consecutive runs on similar code: **3.8%** — within the
≤5% target for baseline stability. The largest single-step variance is
in "Publish packages to Verdaccio" (~12.5%, network-IO bound).

### Phase 1 cold (cache miss)

| Run | Build | E2E run | Publish | Total |
|---|---:|---:|---:|---:|
| `26003870799` | 432s | 254s | 163s | 1182s |

Cold-cache build matches baseline within variance (432s vs 422-430s, +2%).
Cache populates on this run; the next run on the same dependency hash
will exercise the warm restore path.

### Phase 1 warm (cache hit) — REVERTED

Two warm runs surfaced two issues:

**Run `26004370372` (first warm):**
- Build: 432s → 0s (cache fully restored, 47 MB tar) ✅
- E2E run: failed instantly with `./tools/kb-devkit/kb-devkit: Permission denied`.
  Build Go tools step did produce the binary, but the file had mode 0600
  (no +x) when the e2e step tried to invoke it. Root cause TBD;
  unrelated to cache content (cache path is `.kb/devkit/`, not `tools/`).
  Mitigation: defensive `chmod +x` after the Go build and right before
  the e2e invocation (commit `aedbc480`). Verified working.

**Run `26004923126` (second warm, with chmod fix):**
- Build: 0s cached ✅
- E2E run: 13 suites, 12 passed, `e2e-workflows` failed with WS-L04
  `unsubscribe stops the log stream` consistently (3 retries, all
  failed with the same `Expected: 0 Received: 1` assertion).

WS-L04 race is **pre-existing** and was masked in earlier all-green
runs by an unrelated kb-devkit caching defect: the `e2e` task did not
have `cache: false`, so `kb-devkit run e2e` returned `success cached`
for every suite without actually running tests. That hid WS-L04 (and
likely other flakes) under false positives. Fixed in commit `6e9a0c3d`
(`cache: false` on the e2e task).

Once `cache: false` was in place, WS-L04 surfaced as a real flake:

```
subscribe → server replays all initial logs (5+ in this workflow)
→ test consumes first via waitForMessage
→ test sends unsubscribe
→ server processes unsubscribe (activeSubscriptions cleared)
→ test collect(1, 1000) reads the SECOND pre-buffered log
→ assertion fails: logs.length === 1, expected 0
```

The fault is test-side: it treats "logs after unsubscribe" as a proxy
for "stream is active" but in reality the client buffer can hold
multiple already-sent initial logs from the synchronous backfill.
Server-side `activeSubscriptions` gates can't unsend bytes that have
already left the socket.

**Decision: revert Phase 1 (commit `df51a197`) to keep main green.** WS-L04
needs a separate, focused fix (either drain client buffer before
unsubscribe, or change subscribe semantics to not replay history
eagerly) before Phase 1 can land. Phase 0 (instrumentation) stays — it
is pure observability and proved itself in surfacing this exact issue.

### WS-L04 fix and Phase 1 re-enable

Commit `e6505ad0` changes the logs-channel subscribe semantics to
single-entry backfill (`tail -f`-style): only the most recent existing
log is sent on subscribe, offset advances past all stored entries,
polling streams strictly new logs. This eliminates the pre-buffer race
without weakening test expectations.

Run `26005817045` (post-fix, no Phase 1 cache):
- All 8 suites passed, no retries: **services 20/0, platform 8/0,
  plugins 8/0, gateway 14/0, workflows 43/0, studio 11/0,
  marketplace 13/0, marketplace-registry 33/0**.
- Confirmed WS-L04 is no longer flaky.

Phase 1 cache re-enabled in commit (pending) on top of this baseline.

### Validated learning

- kb-devkit's `e2e` task was silently caching success across runs — a
  correctness bug that masked pre-existing flakiness. Permanently fixed.
- The build-cache path itself works (47 MB tar restored cleanly, 0s
  rebuild). Phase 1 is technically viable once WS-L04 is properly
  fixed.
- `tools/kb-devkit/kb-devkit` losing +x is a separate diagnostic to
  carry forward — defensive chmod is in place, root cause TBD.

## References

- [Plan file](../../.claude/plans/tender-strolling-wind.md)
- [ADR-0016: Test Pyramid](./0016-test-pyramid.md) — defines E2E as the top layer this ADR operationalizes
- [Baseline run timings](https://github.com/KirillBaranov/kb-labs/actions/runs/26000866859) — main, all-green, 2026-05-17 19:45 UTC
- [kb-devkit CAS implementation](../../tools/kb-devkit/internal/cache/store.go)

---

**Last Updated:** 2026-05-18
**Next Review:** 2026-06-18 (after Phase 3 reaches main)
