---
id: PC-004
area: platform-core
title: Service restart & recovery
priority: P1
env: kb-env (services running)
requires: PC-002
---

## Goal

Individual services can be restarted without taking down the whole platform.
Other services stay up during a sibling restart.

## Environment

- [ ] All services running

---

## Steps

### Phase 1 — Restart individual service

| # | Action | Expected |
|---|--------|----------|
| 1 | Note Studio PID: `kb-dev status` | PID recorded |
| 2 | `kb-dev restart gateway` | Only gateway restarts, other services unaffected |
| 3 | `kb-dev status` immediately after | workflow, rest-api, state still `running` |
| 4 | Wait ~5s then `curl -s http://localhost:4000/health` | Gateway healthy again |
| 5 | `kb-dev restart workflow` | Only workflow restarts |
| 6 | `curl -s http://localhost:7778/health` | Workflow healthy again |

### Phase 2 — Service survives crash

| # | Action | Expected |
|---|--------|----------|
| 7 | Find gateway PID: `kb-dev status` | PID noted |
| 8 | `kill -9 <gateway-pid>` | Gateway process dies |
| 9 | Wait 5s, `kb-dev status` | `kb-dev` detects crash, shows `failed` or auto-restarts |
| 10 | `kb-dev start` | Gateway comes back up |
| 11 | `curl -s http://localhost:4000/health` | Healthy |

### Phase 3 — Restart does not affect running workflow

| # | Action | Expected |
|---|--------|----------|
| 12 | Start a long workflow run | Run is `running`, note runId |
| 13 | `kb-dev restart gateway` | Gateway restarts |
| 14 | `kb workflow runs view <runId>` | Run still `running` (workflow daemon unaffected) |
| 15 | Run completes normally | Status `success` or `failed` — not `cancelled` due to restart |

---

## Pass criteria

`kb-dev restart <service>` restarts only the named service.
Sibling services stay up. A crashed service can be recovered with `kb-dev start`.
A running workflow is not cancelled by a gateway restart.
