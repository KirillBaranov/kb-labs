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
│  PR opens/updates  ────────►  CI (PR)                           │
│                                                                 │
│  Push to main      ──┬──────►  CI                  (paths-ignore)│
│                      ├──────►  E2E Platform Tests  (paths-ignore)│
│                      ├──────►  Deploy              (paths-only)  │
│                      └──────►  CodeQL              (every push)  │
│                                                                 │
│  Tag v*-binaries   ──┬──────►  Release Binaries                 │
│                      └──────►  E2E Install Flow    (after build) │
│                      └──────►  E2E Platform Tests  (after build) │
│                                                                 │
│  Manual dispatch   ─────────►  Release             (full publish)│
│                                                                 │
│  Weekly cron       ──┬──────►  E2E Platform Tests  (Mon 9am UTC) │
│                      └──────►  E2E Install Flow    (Mon 8am UTC) │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Trigger matrix

| Workflow | push main | PR | Tag | workflow_run | Cron | Dispatch |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| **CI** (`ci.yml`) | ✅ paths-ignore | — | — | — | — | ✅ |
| **CI (PR)** (`ci-pr.yml`) | — | ✅ open/sync/reopen | — | — | — | — |
| **E2E Platform Tests** (`e2e-platform.yml`) | ✅ paths-ignore | — | — | ✅ after Release Binaries | ✅ Mon 9:00 UTC | ✅ |
| **E2E Install Flow** (`e2e-install.yml`) | — | — | — | ✅ after Release Binaries | ✅ Mon 8:00 UTC | ✅ |
| **Deploy** (`deploy.yml`) | ✅ paths-only | — | — | — | — | ✅ |
| **Release Binaries** (`release-binaries.yml`) | — | — | ✅ `v*-binaries` | — | — | ✅ |
| **Release** (`release.yml`) | — | — | — | — | — | ✅ manual |
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
**Purpose:** end-to-end platform tests via `kb-devkit run e2e` across 8 domains. See [ADR-0017](./adr/0017-e2e-pipeline-sharding-and-caching.md) for architecture.
**When:**
- Every push to `main` (with `paths-ignore`).
- After every successful "Release Binaries" run (smoke test on the published binaries).
- Weekly Monday 09:00 UTC (canary).
- Manual dispatch.

**Skips:** same as CI plus `sites/**`. Marketing site is deployed by `deploy.yml` and doesn't run on the platform.
**Concurrency:** `e2e-platform-${{ github.ref }}`, `cancel-in-progress: true`.
**Structure:** 8-shard matrix (one per `@kb-labs/e2e-<suite>`) + aggregator. Branch protection points at the aggregator's `Platform E2E` check.
**Typical duration:** ~8 min wall-clock; per shard ~5–8 min.

### E2E Install Flow (`e2e-install.yml`)
**Purpose:** simulates the full user journey in a clean Docker container — `curl install.sh → bootstrap → verify → kb commit → scaffold → build → run`. Catches install / scaffold regressions that platform tests don't cover.
**When:** after "Release Binaries", weekly Monday 08:00 UTC, manual dispatch.
**Typical duration:** ~5–10 min.

### Deploy (`deploy.yml`)
**Purpose:** declarative delivery to staging/prod via `kb-deploy`. See [ADR-0014](./adr/0014-declarative-delivery-and-fleet-distribution.md).
**When:** push to `main` *only* if it touches one of:
- `sites/web/**`, `core/**`, `shared/**`, `tools/kb-deploy/**`
- specific adapters: `openai`, `redis`, `sqlite`, `pino`, `fs`, `log-sqlite`, `log-ringbuffer`, `eventbus-cache`
- `plugins/gateway/**`, `.kb/deploy.yaml`, `.github/workflows/deploy.yml`
- Manual dispatch with optional `target` input.

**Reuses:** `KB Deploy — Apply` via `workflow_call`.
**Typical duration:** ~10 min.

### Release Binaries (`release-binaries.yml`)
**Purpose:** build and publish all KB Labs Go binaries (`kb-create`, `kb-dev`, `kb-devkit`, `kb-deploy`, `kb-monitor`) as a single GitHub Release.
**When:** tag matching `v*-binaries` (e.g. `v0.4.0-binaries`); manual dispatch.
**Trigger pattern:** push a tag → release built → triggers `E2E Install Flow` and `E2E Platform Tests` (via `workflow_run`) to validate.

### Release (`release.yml`)
**Purpose:** full release workflow — cross-compile binaries for 5 OS/arch combos, publish npm packages, create GitHub Release. Use for major releases that need cross-platform binaries.
**When:** manual dispatch only — never automatic. Releases are intentional acts.
**Concurrency:** `release-${{ github.ref }}` with `cancel-in-progress: false`. Two simultaneous releases on the same ref serialise instead of clobbering.

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

---

## Common scenarios

| What I push | What runs |
|---|---|
| `README.md` only | CodeQL only |
| `docs/**/*.md` only | CodeQL only |
| `sites/web/**` only | Deploy + CI + CodeQL (E2E skipped) |
| `plugins/workflow/**` | CI + E2E Platform Tests + CodeQL |
| `core/runtime/**` | CI + E2E Platform Tests + Deploy + CodeQL |
| `.github/workflows/e2e-platform.yml` | CI + E2E Platform Tests + CodeQL (the workflow file itself isn't in `paths-ignore`) |
| `v0.5.0-binaries` tag pushed | Release Binaries → triggers E2E Install Flow + E2E Platform Tests |
| `kb commit` / `git commit` on a release | Whatever the diff matches above |
| Three commits in 30 seconds | Only the last one's CI + E2E run fully; earlier two are cancelled (visible in UI) |

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
