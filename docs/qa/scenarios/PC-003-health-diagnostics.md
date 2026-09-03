---
id: PC-003
area: platform-core
title: Health & diagnostics
priority: P0
env: kb-env (services running)
requires: PC-002
---

## Goal

Platform self-diagnostics catch real problems and give actionable output.
A developer can quickly tell if something is wrong and why.

## Environment

- [ ] Services running (`kb-dev status` all green)
- [ ] Project directory active

---

## Steps

### Phase 1 — Doctor (clean state)

| # | Action | Expected |
|---|--------|----------|
| 1 | `kb-create doctor` | All checks pass, exit 0 |
| 2 | Output includes Node version check | Node 24+ confirmed |
| 3 | Output includes platform package versions | No version mismatch |
| 4 | Output includes config validation | Config valid |
| 5 | `kb-dev doctor` | All services healthy, exit 0 |
| 6 | `kb-dev doctor` output names each service | gateway, rest-api, workflow, marketplace, state |

### Phase 2 — Gateway health details

| # | Action | Expected |
|---|--------|----------|
| 7 | `curl -s http://localhost:4000/health \| jq .` | `status: healthy`, all adapters listed |
| 8 | Response includes `adapters.llm.available` | Present (true or false — not missing) |
| 9 | Response includes `adapters.cache.available` | Present |
| 10 | Response includes `uptime` in seconds | > 0 |

### Phase 3 — Doctor catches a broken state

| # | Action | Expected |
|---|--------|----------|
| 11 | `kb-dev stop` — stop all services | — |
| 12 | `kb-dev doctor` with services stopped | Reports services as down, does NOT crash |
| 13 | Error message is actionable | Says which service is down, suggests `kb-dev start` |
| 14 | Exit code is non-zero | `echo $?` → 1 |
| 15 | `kb-dev start` — start again | Doctor passes again |

### Phase 4 — Status output

| # | Action | Expected |
|---|--------|----------|
| 16 | `kb-dev status` | Table or list with service name, status, PID, port |
| 17 | `kb-dev status --json` | Valid JSON array/object with same fields |
| 18 | `kb-create status` | Platform version, component list, project path |

---

## Pass criteria

Doctor passes in clean state. Doctor catches stopped services with a clear message.
`--json` output is valid JSON. Exit codes are correct (0 = ok, non-zero = problem).
