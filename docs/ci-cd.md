# CI/CD reference

How the GitHub Actions setup of this repo works: what runs when,
what it checks, and how to see the current state.

> **Living document.** If you change a workflow's triggers or what it
> does, update this file in the same PR. The corresponding ADRs
> ([0017](./adr/0017-e2e-pipeline-sharding-and-caching.md),
> [0018](./adr/0018-ci-compute-budget-and-transparency.md)) record
> *why* each rule exists; this file is the *what runs when*.

---

## At a glance

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  PR opens/updates  ──┬──────►  CI (PR)                          │
│                      └──────►  E2E Platform Tests  (paths-ignore)│
│                                                                 │
│  Push to main      ──┬──────►  CI                  (paths-ignore)│
│                      ├──────►  E2E Platform Tests  (paths-ignore)│
│                      ├──────►  Deploy              (paths-only)  │
│                      └──────►  CodeQL              (every push)  │
│                                                                 │
│  Workflow engine   ──┬──────►  Build candidate (reusable CI)    │
│                      └──────►  Deliver candidate + smoke        │
│                                                                 │
│  Manual dispatch   ─────────►  Release promotion (engine gate)  │
│                                                                 │
│  Weekly cron       ──┬──────►  E2E Platform Tests  (Mon 9am UTC) │
│                      └──────►  Post-publish Smoke (Mon 8am UTC) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Trigger matrix

| Workflow | push main | PR | Tag | workflow_run | Cron | Dispatch |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **CI** (`ci.yml`) | ✅ paths-ignore | — | — | — | — | ✅ |
| **CI (PR)** (`ci-pr.yml`) | — | ✅ open/sync/reopen | — | — | — | — |
| **E2E Platform Tests** (`e2e-platform.yml`) | ✅ paths-ignore | ✅ open/sync/reopen, paths-ignore | — | ✅ after Release Binaries | ✅ Mon 9:00 UTC | ✅ |
| **Launcher E2E** (`reusable-launcher-e2e.yml`) | reusable — invoked by `ci.yml` and `ci-pr.yml` via `workflow_call` |
| **Deploy** (`deploy.yml`) | ✅ paths-only | — | — | — | — | ✅ |
| **Release — deliver** (`release-deliver.yml`) | — | — | — | — | — | ✅ `workflow_call` / dispatch |
| **CodeQL** ("Push on main") | ✅ every push | ✅ | — | — | ✅ default | — |
| **KB Deploy — Apply** (`kb-deploy-apply.yml`) | reusable — invoked by other workflows via `workflow_call` |

---

## What each workflow does

### CI (`ci.yml`)
**Purpose:** lint, type-check, unit tests, and coverage for the entire monorepo.
**When:** every push to `main` (with `paths-ignore`); manual dispatch.
**Skips:** `**/*.md`, `docs/**`, `.claude/**`, `.vscode/**`, `.idea/**`, `.editorconfig`, `LICENSE`, `.github/ISSUE_TEMPLATE/**`, `.github/PULL_REQUEST_TEMPLATE.md`. `sites/**` is **not** skipped — site code is part of the monorepo and is linted/typed.
**Concurrency:** `ci-main-${{ github.ref }}`, `cancel-in-progress: true`. New commit on main cancels in-flight CI.
**Typical duration:** ~17 min.

### CI (PR) (`ci-pr.yml`)
**Purpose:** same checks as `CI` but scoped to the PR's diff base for `--affected` modes. Runs on every PR update.
**When:** PR `opened`, `synchronize`, `reopened`.
**Concurrency:** per PR number; pushing to a PR cancels the prior CI (PR) run.

### E2E Platform Tests (`e2e-platform.yml`)
**Purpose:** end-to-end platform tests via `kb-devkit run e2e` across 8 domains. See [ADR-0017](./adr/0017-e2e-pipeline-sharding-and-caching.md) for architecture, [ADR-0019](./adr/0019-pr-e2e-gate.md) for the PR-gate decision.
**When:**
- **Every PR push** (`opened`, `synchronize`, `reopened`) with `paths-ignore`.
- Every push to `main` (with `paths-ignore`) — safety net.
- After every successful "Release Binaries" run (smoke test on the published binaries).
- Weekly Monday 09:00 UTC (canary).
- Manual dispatch.

**Skips:** same as CI plus `sites/**`. Marketing site is deployed by `deploy.yml` and doesn't run on the platform.
**Concurrency:** `e2e-platform-${{ github.event.pull_request.number || github.ref }}`, `cancel-in-progress: true`. Successive pushes inside the same PR (typical agent flow) cancel earlier runs, so the cost is one full run per PR settle point, not per push.
**Structure:** 8-shard matrix (one per `@kb-labs/e2e-<suite>`) + aggregator. Branch protection points at the aggregator's `Platform E2E` check.
**Typical duration:** ~8 min wall-clock; per shard ~5–8 min.

### Cache policy

PR callers use the `read-write` cache mode: kb-devkit's addressable build CAS
and BuildKit's GHA layer cache may be restored and updated. Packed packages and
Verdaccio storage are never restored from a cross-run cache; the prepare job
passes an immutable same-run bundle to its shards.

Main, scheduled, and release-triggered E2E runs use `off`: they rebuild the
platform, npm tarballs, Verdaccio registry, and images from source. This is the
authoritative verification path. See [ADR-0038](./adr/0038-ci-cache-policy-and-authoritative-builds.md)
for fingerprints, metrics, and the warm-vs-cold audit.

### Launcher E2E (`reusable-launcher-e2e.yml`)
**Purpose:** run the Go `kb-create` end-to-end suite against a local Verdaccio
populated from the monorepo's own built packages — the pre-publish validation
cycle.
**When:** `workflow_call` from `ci.yml` (always) and `ci-pr.yml` (gated on
`tools/kb-create/**` changes).

**The post-publish smoke is no longer a workflow.** It used to live in
`e2e-user-journey.yml`, triggered by `workflow_run` after a delivery — which
meant a smoke that could not block the publication it was smoking, and whose
correlation to a specific release was inferred from run ordering. It is now a
*step in the release itself*: the candidate saga stops at
`artifacts-published` and only reaches `candidate-smoke-passed` once
`smokeExactVersion` returns evidence bound to that exact candidate id and bundle
digest. A failing smoke rejects the candidate and burns its version rather than
producing a red run beside a green release.
**Typical duration:** ~5–15 min.

### Deploy (`deploy.yml`)
**Purpose:** declarative delivery to staging/prod via `kb-deploy`. See [ADR-0014](./adr/0014-declarative-delivery-and-fleet-distribution.md).
**When:** push to `main` *only* if it touches one of:
- `sites/web/**`, `core/**`, `shared/**`, `tools/kb-deploy/**`
- specific adapters: `openai`, `redis`, `sqlite`, `pino`, `fs`, `log-sqlite`, `log-ringbuffer`, `eventbus-cache`
- `plugins/gateway/**`, `.kb/deploy.yaml`, `.github/workflows/deploy.yml`
- Manual dispatch with optional `target` input.

**Reuses:** `KB Deploy — Apply` via `workflow_call`.
**Typical duration:** ~10 min.

### Release — deliver (`release-deliver.yml`)
**Purpose:** the entire CI surface of the release train, and the only one.
**When:** `workflow_call` from the Workflow control plane, or manual dispatch for
recovery.

It replaced `release-build-candidate.yml` and `release-deliver-candidate.yml`,
which between them chose versions, applied them, built the flow, staged npm
artifacts, ran a GoReleaser build and generated the release index — 484 lines of
release decisions that no receipt recorded and no approval covered.

This workflow decides nothing. Its inputs are a `ReleaseDeliveryRequest` and
nothing else: `{receipt_id, candidate_id, bundle_uri, bundle_sha256, step_id,
operation}` plus the pointer preconditions the pointer operations need. There is
no flow, no version, no package pattern and no manifest path, and their absence
is the design — CI that knows the version can pick a different one. It fetches
the bundle the release plugin sealed, verifies the externally supplied digest
*before* reading any bundle content, and calls `kb release deliver-request`,
which publishes exactly those bytes and prints one `DeliveryEvidence` document.

Everything above that call is transport. Every ordering, idempotency and
conflict rule lives in the release plugin, where it is unit-tested; a step in
this file cannot violate one because it cannot express one.

Forbidden here and enforced by a policy test rather than reviewer memory
(`plugins/release/manager-cli/src/__tests__/ci-workflow-policy.test.ts`):
`kb release plan|build|stage|version`, `npm pack`, a GoReleaser build, and index
generation.

Stable promotion is not a separate workflow. It is a Workflow-side saga that
calls this same file with `operation: stage-channel` and then `commit-channel`,
over the same candidate ID and bundle digest the canary used. See
[ADR-0043](./adr/0043-release-bundle-and-delivery-boundaries.md) and the
[release control plane runbook](./runbooks/release-control-plane.md).

### CodeQL ("Push on main")
**Purpose:** static-analysis security scanning.
**When:** GitHub-managed "default setup" — runs on every push to `main` and on PRs.
**Where to configure:** Settings → Code security → CodeQL. Not a workflow YAML in this repo.
**Trade-off:** moving to weekly cron saves ~5 min/push but trades latency on catching new vulnerabilities. See [docs/ci-budget.md](./ci-budget.md) for the UI step.

### KB Deploy — Apply (`kb-deploy-apply.yml`)
**Purpose:** reusable workflow for `kb-deploy plan` + `apply`. Called via `workflow_call` from other workflows (e.g. `deploy.yml` in this repo, or downstream consumer repos).
**No direct triggers** — only invoked by callers.

---

## State inspection

### Badges (README)
The README top renders main-branch status badges for **CI**, **E2E Platform Tests**, and **Deploy**. Green/red at a glance.

### Terminal (`scripts/ci-status.sh`)
```bash
./scripts/ci-status.sh           # latest run per workflow on main (✅/❌)
./scripts/ci-status.sh 24h       # what ran in the last 24h + compute spend
./scripts/ci-status.sh 7d        # 7-day pass/fail summary
```

### GitHub Actions UI
- **Skipped runs** (matched by `paths-ignore`) do not appear in the Actions tab at all. Audit by checking `paths-ignore:` blocks in the workflow YAML directly.
- **Cancelled runs** (from concurrency cancellation) **do** appear, marked "cancelled". Hover to see which subsequent commit pre-empted them.

### Branch protection (the required check)
For `main`, only the aggregator job is required: **Platform E2E**. The 8 individual shards (`Platform E2E / services`, `… / workflows`, etc.) are visible in the PR/commit view for triage and re-run, but only the aggregator gates merges.

**Required checks (set in `Settings → Branches → main`):**
- `Platform E2E` — the aggregator from `e2e-platform.yml` matrix
- `CI (PR)` jobs — `Build Go tools`, `Build TS (devkit)`, `Deps (syncpack)`, `Plugin structure`, `lint`, `type-check`, `test`

With these required, a PR cannot merge until both `CI (PR)` and the PR-triggered `Platform E2E` are green. See [ADR-0019](./adr/0019-pr-e2e-gate.md).

---

## Common scenarios

| What I push | What runs |
|---|---|
| `README.md` only (to main) | CodeQL only |
| `docs/**/*.md` only (to main) | CodeQL only |
| `sites/web/**` only (to main) | Deploy + CI + CodeQL (E2E skipped) |
| `plugins/workflow/**` (to main) | CI + E2E Platform Tests + CodeQL |
| `core/runtime/**` (to main) | CI + E2E Platform Tests + Deploy + CodeQL |
| `.github/workflows/e2e-platform.yml` (to main) | CI + E2E Platform Tests + CodeQL (the workflow file itself isn't in `paths-ignore`) |
| Any non-doc/-site code in a **PR** | CI (PR) + E2E Platform Tests (full matrix, branch protection required) |
| Doc-only / sites-only in a **PR** | CI (PR) only — E2E skipped by `paths-ignore` |
| `v0.5.0-binaries` tag pushed | Release Binaries → triggers Post-publish Smoke + E2E Platform Tests |
| `kb commit` / `git commit` on a release | Whatever the diff matches above |
| Three commits in 30 seconds (PR or main) | Only the last one's CI + E2E run fully; earlier two are cancelled (visible in UI) |

---

## When things go wrong

1. **Main turned red unexpectedly.** Open the README badge, click the failing workflow, find the run. Then:
   - Workflow file changed in last 5 commits? → suspect the workflow.
   - Source code changed? → run the failing job locally if reproducible.
   - Neither? → likely flake or external service. Re-run only the failing job from the GitHub UI.

2. **A workflow I expected to run didn't.** Check `paths-ignore` in the workflow YAML against your diff. If nothing matches, also check `concurrency.cancel-in-progress` — was your push pre-empted by a faster subsequent push?

3. **Compute spend is creeping up.** Run `./scripts/ci-status.sh 7d` and `./scripts/ci-status.sh 24h`. Compare against typical ranges in [docs/ci-budget.md](./ci-budget.md). The first lever is usually CodeQL — see that doc.

4. **Branch protection is blocking a merge.** Look at the **Platform E2E** aggregator status. If it's red while individual shards are green, the aggregator job itself failed — most often because `needs.e2e.result != "success"` due to a cancelled shard. Re-run-cancelled from the UI.

---

## References

- [ADR-0017: E2E pipeline sharding and incremental caching](./adr/0017-e2e-pipeline-sharding-and-caching.md) — why the pipeline runs the way it does
- [ADR-0018: CI compute budget and transparency](./adr/0018-ci-compute-budget-and-transparency.md) — why some pushes skip some workflows
- [ADR-0014: Declarative delivery](./adr/0014-declarative-delivery-and-fleet-distribution.md) — Deploy workflow architecture
- [docs/ci-budget.md](./ci-budget.md) — operational spend reference + CodeQL UI step
- [scripts/ci-status.sh](../scripts/ci-status.sh) — terminal state inspection helper
