---
id: S-029
title: Workflow — Failure is visible and actionable
persona: solo-developer
priority: P0
automation: e2e-todo
e2e: e2e/workflows/scenarios/default/cases/engine.spec.ts
---

## Goal
When a workflow step fails, the developer immediately knows what broke and why —
without digging through logs or guessing.

## Prerequisites
- [ ] Platform running
- [ ] `fail-step` workflow (succeed-first → fail-here → never-runs)

---

## Steps

### Phase 1 — Failure in first failing job

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Run `fail-step` workflow | Status should be `failed` | Status is `dlq` — not `failed` ❌ | ❌ |
| 2 | Failed job has error message | Human-readable error | `Step handler reported failure (exitCode: 1)` — generic, not great | ⚠️ |
| 3 | Subsequent jobs marked `cancelled`/`skipped` | Clean state | `never-runs: queued` — stuck in queued forever ❌ | ❌ |
| 4 | First job completed correctly | `succeed-first: success` | ✅ | ✅ |

### Phase 2 — Error message quality

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 5 | Missing env var | Specific message | Not tested | ⬜ |
| 6 | Command not found | "command not found: X" | Not tested | ⬜ |
| 7 | HTTP step 500 | HTTP status in error | Not tested | ⬜ |

### Phase 3 — DLQ vs failed

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 8 | Normal step failure → `failed` not `dlq` | `failed` | `dlq` — B-029: step failure goes to DLQ | ❌ |
| 9 | DLQ only for infrastructure crashes | Reserved for engine failure | Currently used for any step failure | ❌ |

---

## Result

**FAIL** — Two critical issues:
1. Run status is `dlq` instead of `failed` when a user step exits non-zero
2. Downstream jobs stay in `queued` instead of being cancelled/skipped

## Bugs

| ID | Priority | Description |
|---|---|---|
| B-029 | P0 | Step `exit 1` sends run to `dlq` instead of `failed` — DLQ should be reserved for infrastructure failures |
| B-030 | P1 | Downstream jobs stay `queued` after upstream failure — should be `cancelled` or `skipped` |
| B-031 | P1 | Error message "Step handler reported failure (exitCode: 1)" is generic — doesn't include step name, command, or stderr |

## Notes

- Run date: 2026-06-05. Platform 2.94.0.
