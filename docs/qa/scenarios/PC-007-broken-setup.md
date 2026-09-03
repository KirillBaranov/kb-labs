---
id: PC-007
area: platform-core
title: Diagnose broken setup
priority: P1
env: kb-env (intentionally broken)
requires: PC-001
---

## Goal

When something is wrong (wrong Node version, missing config, stale port, broken
package), the platform gives a clear, actionable error — not a stack trace.

## Environment

- [ ] KB Labs installed
- [ ] Ability to temporarily break things (Node version, config, ports)

---

## Steps

### Phase 1 — Wrong Node version

| # | Action | Expected |
|---|--------|----------|
| 1 | Switch to Node 18: `nvm use 18` (or equivalent) | — |
| 2 | `kb-create doctor` | Fails with clear message: "Node 24+ required, found 18.x" |
| 3 | `kb-dev start` | Refuses to start with same message, exit non-zero |
| 4 | Restore Node 24+: `nvm use 24` | — |

### Phase 2 — Missing config field

| # | Action | Expected |
|---|--------|----------|
| 5 | Break config: remove `gateway` key from `.kb/kb.config.json` | — |
| 6 | `kb-dev start` | Fails with clear message naming the missing field |
| 7 | Message includes hint on how to fix | Not just "Cannot read property of undefined" |
| 8 | Restore config | — |

### Phase 3 — Port already in use

| # | Action | Expected |
|---|--------|----------|
| 9 | Occupy port 4000: `nc -l 4000 &` | Port held |
| 10 | `kb-dev start` | Fails with "Port 4000 already in use" — names the service |
| 11 | No other services affected | Only gateway fails to start |
| 12 | `kill %1` to free port | — |
| 13 | `kb-dev start` | Gateway starts normally |

### Phase 4 — Stale socket / lock file

| # | Action | Expected |
|---|--------|----------|
| 14 | Simulate stale socket: `touch /tmp/kb-test/gateway.sock` | — |
| 15 | `kb-dev start` | Cleans up stale socket, starts cleanly |
| 16 | No error about "address already in use" | — |

### Phase 5 — Unresolved config placeholder

| # | Action | Expected |
|---|--------|----------|
| 17 | Add `"socketPath": "/tmp/kb-${MISSING_VAR}/svc.sock"` to a service in config | — |
| 18 | `kb-dev start` | Fails with "Unresolved placeholder: MISSING_VAR" — not ECONNREFUSED |
| 19 | Message names the config key where the placeholder was found | Actionable |
| 20 | Restore config | — |

---

## Pass criteria

Every broken state produces a human-readable error that names what is wrong
and suggests how to fix it. No raw stack traces. Exit codes are non-zero on failure.
The platform never silently passes with a broken config.
