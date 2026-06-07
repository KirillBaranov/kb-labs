---
id: S-008
title: Workflow — Cancel running workflow
persona: solo-developer
priority: P1
automation: e2e-todo
e2e: e2e/workflows/scenarios/default/cases/cancellation.spec.ts
---

## Goal
Developer cancels a workflow that is actively running. Run stops cleanly, no zombie processes.

## Prerequisites
- [ ] Platform installed, services running
- [ ] A long-running workflow exists (e.g. with a `sleep` step)

---

## Steps

### Phase 1 — Start and cancel

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Start long-running workflow: `kb workflow run <name>` | Run starts, status `running` | | ⬜ |
| 2 | `kb workflow cancel <runId>` | Accepted, status transitions to `cancelled` | | ⬜ |
| 3 | `kb workflow status <runId>` | Status is `cancelled`, not `running` or `failed` | | ⬜ |

### Phase 2 — Cancel via HTTP

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `POST /api/v1/runs/:runId/cancel` | HTTP 200, run cancelled | | ⬜ |
| 5 | `GET /api/v1/runs/:runId` after cancel | `status: "cancelled"` | | ⬜ |

### Phase 3 — Edge cases

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | Cancel already-completed run | 400 or no-op with message — not crash | | ⬜ |
| 7 | Cancel non-existent runId | 404 with clear message | | ⬜ |

---

## Result
## Bugs
## Notes
