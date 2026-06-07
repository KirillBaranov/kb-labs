---
id: S-007
title: Workflow — Run with inputs
persona: solo-developer
priority: P0
automation: e2e-todo
e2e: e2e/workflows/scenarios/default/cases/basic.spec.ts
---

## Goal
Developer runs a workflow passing custom input values, verifies inputs are received by jobs.

## Prerequisites
- [ ] Platform installed, services running
- [ ] At least one workflow with defined `inputs` exists in `.kb/workflows/`

---

## Steps

### Phase 1 — Run with inputs via CLI

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb workflow run <name> --input key=value` | Run starts, runId returned | | ⬜ |
| 2 | `kb workflow status <runId>` | Shows `queued` → `running` → `completed` | | ⬜ |
| 3 | Input value reflected in job output/logs | Job received correct input | | ⬜ |

### Phase 2 — Run with inputs via HTTP

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 4 | `POST /api/v1/workflows/:id/runs` with `{"input": {"key": "value"}}` | `{ok: true, data: {runId, status: "queued"}}` | | ⬜ |
| 5 | `GET /api/v1/runs/:runId` shows inputs | `inputs` field matches what was sent | | ⬜ |

### Phase 3 — Input validation

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 6 | Run with missing required input | Clear error — not silent fail | | ⬜ |
| 7 | Run with extra/unknown inputs | Warning or ignored — not crash | | ⬜ |

---

## Result
## Bugs
## Notes
