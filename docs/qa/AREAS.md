# KB Labs QA — Area Catalog

All scenarios are written against a clean `kb-env` install, not the dev monorepo.
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

## Areas

### PC — Platform Core
Install, start, health, update, rollback, diagnostics.

| ID | Title | Priority |
|----|-------|----------|
| [PC-001](scenarios/PC-001-clean-install.md) | Clean install from scratch | P0 |
| [PC-002](scenarios/PC-002-first-start.md) | First start — all services up | P0 |
| [PC-003](scenarios/PC-003-health-diagnostics.md) | Health & diagnostics | P0 |
| [PC-004](scenarios/PC-004-service-restart.md) | Service restart & recovery | P1 |
| [PC-005](scenarios/PC-005-platform-update.md) | Platform update | P0 |
| [PC-006](scenarios/PC-006-platform-rollback.md) | Platform rollback | P1 |
| [PC-007](scenarios/PC-007-broken-setup.md) | Diagnose broken setup | P1 |

### GW — Gateway
LLM proxy, auth, routing, rate limits, webhooks.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### WF — Workflow Engine
Create, run, cancel, inputs/outputs, parallel, approval, error handling, restart.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### ST — Studio
Login, runs list, run detail, trigger, approval UI.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### MN — Mind / RAG
Search, index, sources, embeddings, confidence.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### MK — Marketplace
Install, enable/disable, update, publish, rollback.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### PL — Plugins (built-in)
Commit, review, release, quality, impact.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### AG — Agents
Run agent, MCP tools, plan mode, memory.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### CF — Config & Environment
Dev/prod switch, auth modes, socket vs TCP, env vars.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### RS — Resilience
Service restart, concurrent runs, large payloads, timeout, recovery.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### SC — Security
CSRF, permissions, injection, token validation.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### CLI — CLI Framework
Discovery, help, flags, output formats, long-running, cancellation.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### MCP — MCP Server
Server start, tool discovery, tool call from Claude, schemas, errors.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### SS — Session & Auth
Login, logout, token expiry, transparent refresh, CSRF.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |

### RF — Refresh
Token refresh end-to-end, session continuity.

| ID | Title | Priority |
|----|-------|----------|
| _(coming soon)_ | | |
