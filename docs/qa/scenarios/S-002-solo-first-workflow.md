---
id: S-002
title: Solo — First AI Workflow
persona: solo-developer
priority: P0
automation: e2e-todo
e2e: e2e/workflows/scenarios/default/cases/basic.spec.ts
---

## Goal

Developer starts platform services and runs their first workflow — either via CLI or Studio UI.
Validates that the workflow engine is reachable, a run is created, and result is visible.

## Prerequisites

- [ ] KB Labs installed (`kb-create` done, project exists)
- [ ] Services not yet started
- [ ] Node.js 24+, no port conflicts on 4000, 5050, 7778, 3000

---

## Steps

### Phase 1 — Start services

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 1 | `kb-dev start` | All services start, no errors. gateway :4000, rest :5050, workflow :7778, studio :3000 | 5/6 started. Studio failed — port 3000 already in use by kb-web (dev services). **Exit 0 despite failure.** | ⚠️ |
| 2 | `kb-dev status` | All services green | 5 alive, studio dead | ⚠️ |
| 3 | `curl http://localhost:4000/health` | HTTP 200, `status: healthy` | 200 ✅. Also shows all adapters available. | ✅ |
| 4 | `curl http://localhost:7778/health` | HTTP 200, `status: ok` | 200 ✅ | ✅ |

### Phase 2 — Discover workflows via CLI

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 5 | `kb workflow list` | Lists available workflows | Stack trace: `Token refresh failed (401)`. Exit 0 but no output. CLI routes through gateway — credentials missing from project. | ❌ |
| 6 | `kb workflow list --json` | Valid JSON output | Same failure | ❌ |

> **Note:** Workflow API works correctly via direct HTTP — this is purely a CLI auth issue (same root cause as B-001).

### Phase 3 — Run a workflow via HTTP (bypass CLI auth)

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 7 | `GET http://localhost:7778/api/v1/workflows` | Returns workflows list | ✅ Returns `deploy-with-approval` workflow | ✅ |
| 8 | `POST http://localhost:7778/api/v1/workflows/deploy-with-approval/runs` | Returns `{runId, status: "queued"}` | ✅ runId received | ✅ |
| 9 | `GET http://localhost:7778/api/v1/runs/:runId` | Status transitions to `completed` | ❌ Status is `dlq` (dead letter queue). Job `build-and-test` failed with `exitCode: 1`. Example workflow has a real shell step that fails in this environment. | ❌ |

### Phase 4 — Studio UI

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 10 | Open `http://localhost:3000` | Studio loads | Studio not started (port conflict) | ❌ |
| 11 | Workflows section visible | — | Not tested | ⬜ |
| 12 | Trigger run from UI | — | Not tested | ⬜ |

### Phase 5 — Stop services

| # | Action | Expected | Actual | Status |
|---|--------|----------|--------|--------|
| 13 | `kb-dev stop` | All services stopped | Stopped 5 services. Studio was already dead. | ✅ |
| 14 | `kb-dev status` after stop | All stopped | Not checked | ⬜ |

---

## Result

**FAIL** — CLI completely blocked by auth (B-001 cascade). HTTP API works but example workflow fails on execution.

## Bugs

| ID | Step | Priority | Description |
|---|---|---|---|
| B-008 | 1 | P1 | `kb-dev start` exits 0 even when services fail to start (studio port conflict) |
| B-009 | 1 | P1 | Studio port 3000 conflicts with kb-web from dev infrastructure. Needs port isolation between dev services and platform services. |
| B-010 | 5,6 | P0 | `kb workflow list` fails with raw 401 stack trace — same root cause as B-001. Entire CLI unusable without valid credentials. |
| B-011 | 9 | P1 | Example workflow `deploy-with-approval` goes to `dlq` on first run — `build-and-test` step fails (exitCode: 1). No user-friendly error in run response body. |

> **Root:** B-010 = B-001 cascade. Fix B-001 → B-010 goes away.

## Notes

- `GET /api/v1/workflows` via gateway (:4000) returns 404 — route not proxied. Direct :7778 works.
- Workflow engine internals healthy, API contract correct. CLI auth is the only blocker.
- Run date: 2026-06-05. Platform: `2.93.4-binaries`. macOS Darwin 24.5.0 / Node 20.19.4.
