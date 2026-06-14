# KB Labs QA — Area Catalog

All scenarios run against a clean `kb-env` install (not the dev monorepo).
Every feature PR must add or update at least one scenario in the relevant area.

## How to run

1. `kb-env up` — fresh isolated environment
2. Pick scope: P0 only (release gate) or full
3. Work through each scenario, fill in `Actual` and `Status`
4. Copy `runs/TEMPLATE.md` → `runs/YYYY-MM-DD.md`, paste summary there
5. File a GitHub issue for every ❌, link in the run log

## Status legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not tested |
| ✅ | Pass |
| ⚠️ | Pass with caveats |
| ❌ | Fail |

## Priority legend

| Priority | Meaning |
|----------|---------|
| P0 | Release blocker — must be ✅ before any publish |
| P1 | Must pass before stable tag |
| P2 | Known issue acceptable at launch |

---

## PC — Platform Core
Install, start, health, update, rollback, diagnostics.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| [PC-001](scenarios/PC-001-clean-install.md) | Clean install from scratch | P0 | ⬜ |
| [PC-002](scenarios/PC-002-first-start.md) | First start — all services up | P0 | ⬜ |
| [PC-003](scenarios/PC-003-health-diagnostics.md) | Health & diagnostics | P0 | ⬜ |
| [PC-004](scenarios/PC-004-service-restart.md) | Service restart & recovery | P1 | ⬜ |
| [PC-005](scenarios/PC-005-platform-update.md) | Platform update | P0 | ⬜ |
| [PC-006](scenarios/PC-006-platform-rollback.md) | Platform rollback | P1 | ⬜ |
| [PC-007](scenarios/PC-007-broken-setup.md) | Diagnose broken setup | P1 | ⬜ |

---

## GW — Gateway
LLM proxy, routing, auth, rate limits, webhooks, upstream errors.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| GW-001 | LLM request proxied end-to-end | P0 | ⬜ |
| GW-002 | Connect own API key | P0 | ⬜ |
| GW-003 | Switch LLM provider | P1 | ⬜ |
| GW-004 | Rate limiting & quota | P1 | ⬜ |
| GW-005 | Webhook delivery on run complete | P1 | ⬜ |
| GW-006 | Auth — valid / invalid token | P0 | ⬜ |
| GW-007 | Upstream unreachable — graceful error | P1 | ⬜ |

---

## WF — Workflow Engine
Create, run, cancel, inputs/outputs, parallel, approval, errors, restart, timeout.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| WF-001 | Create workflow from YAML | P0 | ⬜ |
| WF-002 | Run with inputs | P0 | ⬜ |
| WF-003 | Cancel running run | P1 | ⬜ |
| WF-004 | Parallel steps — all start and complete | P1 | ⬜ |
| WF-005 | Step outputs passed to next step | P0 | ⬜ |
| WF-006 | Approval gate — trigger, approve, continue | P0 | ⬜ |
| WF-007 | Approval gate — reject | P1 | ⬜ |
| WF-008 | Step failure — visible and actionable | P0 | ⬜ |
| WF-009 | Restart from step (skipTo) | P1 | ⬜ |
| WF-010 | Rerun failed run | P1 | ⬜ |
| WF-011 | Step timeout kills process cleanly | P1 | ⬜ |
| WF-012 | Object inputs — jq --argjson works | P1 | ⬜ |
| WF-013 | Short ID resolution (view/cancel/approve) | P1 | ⬜ |
| WF-014 | Webhook on run completion | P1 | ⬜ |
| WF-015 | Run history and logs after completion | P0 | ⬜ |

---

## OB — Workflow CLI Observability
List, view, logs, watch, filter, approve from CLI.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| OB-001 | List runs — table with status, duration, short ID | P0 | ⬜ |
| OB-002 | List runs — filter by status | P1 | ⬜ |
| OB-003 | View run — tree of phases, steps, errors | P0 | ⬜ |
| OB-004 | View run — live while running | P1 | ⬜ |
| OB-005 | Logs — tail step output | P0 | ⬜ |
| OB-006 | Approve pending run from CLI | P0 | ⬜ |
| OB-007 | Reject pending run from CLI | P1 | ⬜ |
| OB-008 | PENDING_APPROVAL visible in list | P0 | ⬜ |
| OB-009 | Current step name shown for RUNNING runs | P1 | ⬜ |

---

## ST — Studio
Login, runs list, run detail, trigger, approval UI, live progress.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| ST-001 | First load — no flash of login page | P0 | ⬜ |
| ST-002 | Workflow runs list loads with data | P0 | ⬜ |
| ST-003 | Run detail — phases, steps, errors | P0 | ⬜ |
| ST-004 | Trigger run from Studio | P1 | ⬜ |
| ST-005 | Approve / reject from Studio | P1 | ⬜ |
| ST-006 | Filter runs by status | P1 | ⬜ |
| ST-007 | Live progress while run is in flight | P1 | ⬜ |

---

## MN — Mind / RAG
Index, search, sources, confidence, re-index.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| MN-001 | Index a codebase | P0 | ⬜ |
| MN-002 | Search returns relevant results | P0 | ⬜ |
| MN-003 | Confidence score present in results | P1 | ⬜ |
| MN-004 | Source attribution — files named | P1 | ⬜ |
| MN-005 | Re-index after code change | P1 | ⬜ |
| MN-006 | Search with low confidence — says so | P1 | ⬜ |

---

## MK — Marketplace
Install, enable/disable, update, publish, lock integrity.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| MK-001 | Install entity | P0 | ⬜ |
| MK-002 | Enable / disable entity | P1 | ⬜ |
| MK-003 | Update entity | P1 | ⬜ |
| MK-004 | Publish entity | P1 | ⬜ |
| MK-005 | Lock file integrity after ops | P0 | ⬜ |
| MK-006 | Install unknown entity — clear error | P1 | ⬜ |

---

## PL — Plugins (built-in)
Commit, review, release, quality, output formats.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| PL-001 | kb commit — generates AI commit message | P0 | ⬜ |
| PL-002 | kb commit — falls back gracefully without LLM | P0 | ⬜ |
| PL-003 | kb review — outputs code review | P0 | ⬜ |
| PL-004 | kb release — generates changelog | P1 | ⬜ |
| PL-005 | kb quality — outputs metrics | P1 | ⬜ |

---

## AG — Agents
Run agent, MCP tools, plan mode, memory, error handling.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| AG-001 | Run agent — completes a task | P0 | ⬜ |
| AG-002 | Agent uses MCP tool successfully | P1 | ⬜ |
| AG-003 | Agent plan mode — plan shown before execution | P1 | ⬜ |
| AG-004 | Agent memory persists across runs | P1 | ⬜ |
| AG-005 | Agent handles LLM error gracefully | P1 | ⬜ |

---

## CF — Config & Environment
Auth modes, socket vs TCP, env vars, dev/prod switch, placeholder validation.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| CF-001 | auth.enabled=false — Studio accessible without login | P0 | ⬜ |
| CF-002 | Socket mode — services talk via Unix socket | P0 | ⬜ |
| CF-003 | KB_SOCKET_HASH injected by kb-dev automatically | P0 | ⬜ |
| CF-004 | Unresolved config placeholder → clear error at startup | P0 | ⬜ |
| CF-005 | Dev vs prod config switch | P1 | ⬜ |
| CF-006 | Env vars from kb-dev available in workflow steps | P1 | ⬜ |

---

## RS — Resilience
Service restart during run, concurrent runs, large payloads, long runs.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| RS-001 | Gateway restart doesn't cancel running workflow | P1 | ⬜ |
| RS-002 | Two concurrent runs don't interfere | P1 | ⬜ |
| RS-003 | Large input payload (1MB+) handled | P2 | ⬜ |
| RS-004 | Long-running step (60+ min) doesn't time out prematurely | P1 | ⬜ |
| RS-005 | Run queue — 10+ runs queued, all execute in order | P2 | ⬜ |

---

## SC — Security
CSRF, auth boundaries, permission checks, injection, token invalidation.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| SC-001 | CSRF token required for mutations | P0 | ⬜ |
| SC-002 | Unauthenticated request → 401, not 500 | P0 | ⬜ |
| SC-003 | Insufficient permissions → 403, not 500 | P0 | ⬜ |
| SC-004 | Shell injection in workflow input stays in sandbox | P0 | ⬜ |
| SC-005 | Logout invalidates session immediately | P1 | ⬜ |

---

## CLI — CLI Framework
Discovery, help, flags, output formats, progress, cancellation, errors.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| CLI-001 | Command discovery after plugin install | P0 | ⬜ |
| CLI-002 | `--help` available on every command | P0 | ⬜ |
| CLI-003 | `--json` output is valid JSON | P1 | ⬜ |
| CLI-004 | Long-running command shows progress | P1 | ⬜ |
| CLI-005 | Ctrl+C cancels cleanly, no zombie process | P1 | ⬜ |
| CLI-006 | Unknown command → helpful suggestion, not crash | P1 | ⬜ |
| CLI-007 | Missing required flag → named error | P1 | ⬜ |

---

## MCP — MCP Server
Start, tool discovery, tool call, schema validation, shutdown.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| MCP-001 | MCP server starts and is reachable | P0 | ⬜ |
| MCP-002 | Tool list returned to Claude | P0 | ⬜ |
| MCP-003 | Tool call succeeds end-to-end | P0 | ⬜ |
| MCP-004 | Tool call with invalid args → schema error, not crash | P1 | ⬜ |
| MCP-005 | MCP server shutdown is clean | P1 | ⬜ |

---

## SS — Session & Auth
Login, logout, invalid credentials, protected routes, session persistence.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| SS-001 | Login with valid credentials | P0 | ⬜ |
| SS-002 | Login with invalid credentials — clear error | P0 | ⬜ |
| SS-003 | Logout clears session | P0 | ⬜ |
| SS-004 | Access protected route without token → 401 | P0 | ⬜ |
| SS-005 | Session persists across browser tab reload | P1 | ⬜ |
| SS-006 | Two users — sessions are isolated | P1 | ⬜ |

---

## RF — Refresh
Transparent refresh, expired refresh token, multi-tab.

| ID | Title | Priority | Status |
|----|-------|----------|--------|
| RF-001 | Expired access token → transparent refresh → continue | P0 | ⬜ |
| RF-002 | Expired refresh token → redirect to login | P0 | ⬜ |
| RF-003 | Active request retried after refresh | P1 | ⬜ |
| RF-004 | Multiple open tabs — one refresh, all tabs continue | P2 | ⬜ |

---

## Total

| Area | Scenarios | P0 | P1 | P2 |
|------|-----------|----|----|-----|
| PC — Platform Core | 7 | 4 | 3 | 0 |
| GW — Gateway | 7 | 2 | 5 | 0 |
| WF — Workflow Engine | 15 | 5 | 10 | 0 |
| OB — CLI Observability | 9 | 4 | 5 | 0 |
| ST — Studio | 7 | 2 | 5 | 0 |
| MN — Mind / RAG | 6 | 2 | 4 | 0 |
| MK — Marketplace | 6 | 2 | 4 | 0 |
| PL — Plugins | 5 | 3 | 2 | 0 |
| AG — Agents | 5 | 1 | 4 | 0 |
| CF — Config | 6 | 4 | 2 | 0 |
| RS — Resilience | 5 | 0 | 3 | 2 |
| SC — Security | 5 | 4 | 1 | 0 |
| CLI — CLI Framework | 7 | 2 | 5 | 0 |
| MCP — MCP Server | 5 | 3 | 2 | 0 |
| SS — Session & Auth | 6 | 4 | 2 | 0 |
| RF — Refresh | 4 | 2 | 1 | 1 |
| **Total** | **105** | **44** | **58** | **3** |
