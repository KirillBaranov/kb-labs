# CI compute budget

Quick reference for managing GitHub Actions spend on this repo.

## Current state (after ADR-0017 + paths-ignore commit)

| Workflow | Trigger | Typical wall-clock | Compute per run |
|---|---|---:|---:|
| **CI** | push to main, paths-ignore covers `.md`/`docs`/`.claude` | ~17 min | ~17 min |
| **E2E Platform Tests** | push to main, paths-ignore covers `.md`/`docs`/`sites`/`.claude` | ~8 min wall, **8 shards × 5–8 min** | **~50 min** |
| **CodeQL** ("Push on main") | every push to main *(see below)* | ~5 min | ~5 min |
| **Deploy** | push to main, only on `sites/web/**`, `core/**`, gateway/openai adapters | ~10 min | ~10 min |

Concurrency: CI and E2E cancel in-flight runs from older commits on the
same branch, so rapid push sequences cost only the final run.

## Quick checks

```bash
./scripts/ci-status.sh           # ✅/❌ for each workflow's last main run
./scripts/ci-status.sh 24h       # compute spend last 24h, by workflow
./scripts/ci-status.sh 7d        # 7-day summary
```

The terminal output mirrors what the README badges show but with totals.

## Trimming further

If steady-state spend creeps up, here are the next levers:

### 1. CodeQL — move from "every push" to "weekly"

CodeQL's default-setup runs on every push to default branch. Most OSS
projects move it to a weekly cron and re-run on demand. Saves ~5 min
compute per push (~75 min/day at 15 commits/day).

**How:** GitHub UI → Settings → Code security → Code scanning →
CodeQL → "Set up" → switch to "Advanced" → edit `.github/workflows/codeql.yml`
to use `schedule: '0 6 * * 1'` instead of `push: branches: [main]`.

Or stay default-setup and just accept the cost — CodeQL on every push
catches new vulnerabilities the moment they land. Trade-off.

### 2. E2E Platform Tests — schedule-only or affected-only

Currently E2E runs on every push that touches non-doc paths. Alternatives:

- **Daily + tag-triggered.** Move push trigger to `paths: [<critical
  paths>]` only, run a full sweep nightly and on release tags. Best
  for stable codebases where E2E rarely catches new regressions per
  push.
- **`kb-devkit run e2e --affected` on PR, full on main.** Requires
  the dependency graph to accurately map source changes → affected
  e2e packages. Plan-tracked in ADR-0017 as Phase 4 work.

### 3. Self-hosted runners

Not justified at current scale. Mentioned only so you know it's an
option if compute becomes a hard cap on a paid plan or a private repo.

## When to revisit

- Public OSS quota is effectively unlimited. The trigger to revisit is
  not cost but **wall-clock pain**: if PR feedback time exceeds 10 min
  consistently, look at Phase 4 in ADR-0017 (build-once / test-many).
- Compute-min track is in `gh api /repos/.../actions/runs/<id>/timing`.
  Aggregate via `scripts/ci-status.sh 7d`.
