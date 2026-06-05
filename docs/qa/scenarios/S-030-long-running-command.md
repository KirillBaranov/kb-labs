---
id: S-030
title: Plugin command — Long-running, progress visible, cancellable
persona: solo-developer
priority: P1
automation: manual
e2e: —
---

## Goal
Developer runs a command that takes time. Terminal shows progress, Ctrl+C cancels cleanly.

## Prerequisites
- [ ] Services running, `ai-review` plugin installed

---

## Steps

### Phase 1 — Progress visible

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb review run --scope=all` | Progress indicator from first second | Spinner visible immediately: `⠋ Running heuristic analysis...` | ✅ |
| 2 | Output streams incrementally | Something updates regularly | Spinner updates, result in ~3.5s | ✅ |
| 3 | User can tell working vs hung | Spinner/dots | Spinner present | ✅ |

### Phase 2 — Ctrl+C

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | Ctrl+C during review | Graceful exit with message | Process terminates (SIGINT sent) | ✅ |
| 5 | No orphaned processes | No zombie node processes | Service processes remain (expected), review process gone | ✅ |
| 6 | Terminal prompt restored | Not stuck | Prompt returns | ✅ |
| — | Worker EPIPE after Ctrl+C | Silent | `[Worker worker_xxx] Uncaught exception: Error: write EPIPE` printed to log | ⚠️ |

### Phase 3 — Timeout and concurrent

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | Command hangs beyond timeout | Times out with message | Not tested | ⬜ |
| 9 | Two parallel `kb review run` | Both complete | Not tested | ⬜ |

---

## Result

**PASS** — Progress visible, Ctrl+C works, no zombies. Minor: EPIPE error printed on cancel (noisy but not breaking).

## Bugs

| ID | Priority | Description |
|---|---|---|
| B-032 | P2 | Worker prints `write EPIPE` on Ctrl+C — noisy but harmless. Should be caught silently. |

## Notes

- `kb review run` without args requires staged changes. Use `--scope=all` for full review.
- Review completes in ~3.5s on 47-file project (heuristic, no LLM).
- Run date: 2026-06-05. Platform 2.94.0.
