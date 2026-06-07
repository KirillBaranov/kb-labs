---
id: S-027
title: Workflow — Live progress while running
persona: solo-developer
priority: P0
automation: e2e-todo
e2e: e2e/workflows/scenarios/default/cases/sse/
---

## Goal
Developer triggers a workflow and watches steps complete one-by-one in real time —
without refreshing or polling manually. Critical for long workflows where waiting blind is painful.

## Prerequisites
- [ ] Platform running, workflow daemon healthy
- [ ] A multi-step workflow exists (≥3 jobs with visible steps)

---

## Steps

### Phase 1 — Start and observe live

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | Start workflow: `kb workflow run <name> --watch` | Output streams immediately | CLI blocked by auth (B-001) | ❌ |
| 2 | Each job appears as it starts — not all at once | Steps print as they begin | Not tested via CLI | ⬜ |
| 3 | Completed step shows ✅, running shows progress | Visual distinction | Not tested | ⬜ |
| 4 | Final status shown when all jobs done | `completed` / `failed` at the end | Not tested | ⬜ |

### Phase 2 — Stream via API (SSE)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 5 | `GET /api/v1/runs/:runId/stream` | Event stream opens | 404 — route not found | ❌ |
| 6 | Events include `job.started`, `job.completed` | Typed events | Route doesn't exist | ❌ |
| 7 | Stream closes cleanly on run finish | No hanging connection | N/A | ⬜ |

### Phase 3 — Reconnect after disconnect

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 8 | Kill SSE connection mid-run, reconnect | Catches up with missed events | Not tested — no SSE endpoint | ⬜ |

---

## Result

**FAIL** — SSE streaming endpoint does not exist (`/api/v1/runs/:runId/stream` → 404).
Developer has no way to watch live progress. Must poll `/api/v1/runs/:runId` manually.

## Bugs

| ID | Priority | Description |
|---|---|---|
| B-027 | P0 | No SSE streaming endpoint for run progress — developer must poll manually |

## Notes

- Run date: 2026-06-05. Platform 2.94.0.
- e2e SSE specs exist in `e2e/workflows/scenarios/default/cases/sse/` — may be testing a different path or gateway route.
