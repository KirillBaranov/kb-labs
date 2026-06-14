---
id: PC-002
area: platform-core
title: First start — all services up
priority: P0
env: kb-env (fresh, after PC-001)
requires: PC-001
---

## Goal

Developer starts all KB Labs services for the first time and confirms every service
is healthy and reachable.

## Environment

- [ ] PC-001 completed — project exists, `kb` in PATH
- [ ] Ports 4000, 5050, 5070, 7777, 7778 are free

---

## Steps

### Phase 1 — Start services

| # | Action | Expected |
|---|--------|----------|
| 1 | `kb-dev start` (inside project dir) | All services start, no immediate crash |
| 2 | Wait ~10 seconds | — |
| 3 | `kb-dev status` | All services show `running` (green), no `failed` |
| 4 | Output lists: gateway, rest-api, workflow, marketplace, state | All 5 present |

### Phase 2 — Verify each service responds

| # | Action | Expected |
|---|--------|----------|
| 5 | `curl -s http://localhost:4000/health` | `{"status":"healthy",...}`, HTTP 200 |
| 6 | `curl -s http://localhost:5050/health` | `{"status":"healthy",...}`, HTTP 200 |
| 7 | `curl -s http://localhost:5070/health` | `{"status":"healthy",...}`, HTTP 200 |
| 8 | `curl -s http://localhost:7777/health` | `{"status":"healthy",...}`, HTTP 200 |
| 9 | `curl -s http://localhost:7778/health` | `{"status":"healthy",...}`, HTTP 200 |

### Phase 3 — Gateway routes correctly

| # | Action | Expected |
|---|--------|----------|
| 10 | `curl -s http://localhost:4000/api/v1/runs?limit=1` | JSON response (200 or 401), not connection refused |
| 11 | `curl -s http://localhost:4000/auth/me` | JSON with userId, not 500 or ECONNREFUSED |
| 12 | `curl -s http://localhost:4000/api/v1/studio/registry` | JSON with plugin registry |

### Phase 4 — Stop gracefully

| # | Action | Expected |
|---|--------|----------|
| 13 | `kb-dev stop` | All services stop, no orphan processes |
| 14 | `kb-dev status` | All services show `stopped` |
| 15 | `curl -s http://localhost:4000/health` | Connection refused (services are down) |
| 16 | `kb-dev start` again | Services restart cleanly |

---

## Pass criteria

All services reach `running` within 30 seconds of `kb-dev start`.
All health endpoints return 200. Stop is clean (no zombie processes).

## Notes

- If a service shows `failed`: `kb-dev logs <service>` for details
- Socket mode (KB_SOCKET_HASH) is injected automatically by `kb-dev` — do not set manually
