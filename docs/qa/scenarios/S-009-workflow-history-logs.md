---
id: S-009
title: Workflow — Run history and logs
persona: solo-developer
priority: P1
automation: e2e-todo
e2e: e2e/workflows/scenarios/default/cases/runs.spec.ts
---

## Goal
Developer can view history of past workflow runs and read step-level logs for debugging.

## Prerequisites
- [ ] Platform installed, services running
- [ ] At least 2 completed workflow runs exist

---

## Steps

### Phase 1 — List runs

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb workflow runs` or `GET /api/v1/runs` | Returns list of past runs with id/status/time | | ⬜ |
| 2 | Filter by workflow: `kb workflow runs --workflow <name>` | Shows only runs for that workflow | | ⬜ |
| 3 | Pagination: large history (20+ runs) | Does not crash, pagination works or returns latest N | | ⬜ |

### Phase 2 — Inspect a run

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `GET /api/v1/runs/:runId` | Returns run with `jobs` array, each job has `status` | | ⬜ |
| 5 | Each job has `startedAt`, `completedAt` | Timestamps present and valid ISO8601 | | ⬜ |
| 6 | Failed job has `error` field | Error message and stack visible | | ⬜ |

### Phase 3 — Logs

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | `kb logs workflow` or `GET /api/v1/runs/:runId/logs` | Step output visible | | ⬜ |
| 8 | Logs for a failed step show what went wrong | Clear error output, not empty | | ⬜ |

---

## Result
## Bugs
## Notes
