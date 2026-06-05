# KB Labs — QA Scenarios

Manual scenario testing — the source of truth for what a real user can do in the system.
Forms the basis for automated e2e tests and pre-release regression checks.

## How to use

### Manual run (pre-release)

1. Pick the scenarios to run (at minimum all P0)
2. Go through each step in order, fill in **Actual** and **Status**
3. Copy `runs/TEMPLATE.md` → `runs/YYYY-MM-DD.md`, paste results there
4. File bugs for every FAIL, link them in the run log

### Automation status

| Value | Meaning |
|---|---|
| `manual` | No automated test yet |
| `e2e-todo` | Planned, not written |
| `e2e-done` | Covered — link in `e2e` field |

### Priority

| Priority | Meaning |
|---|---|
| P0 | Blocks release — must pass before any publish |
| P1 | Important — must pass before stable tag |
| P2 | Nice to have — can ship with known issue |

---

## Scenario Index

### Install & First Run
| ID | Title | Persona | Priority | Automation |
|---|---|---|---|---|
| [S-001](scenarios/S-001-solo-install-first-run.md) | Solo — Install & First Run | solo-developer | P0 | e2e-done |
| [S-023](scenarios/S-023-platform-update.md) | Platform — Update | solo-developer | P0 | e2e-done |
| [S-024](scenarios/S-024-platform-rollback.md) | Platform — Rollback | solo-developer | P1 | manual |
| [S-025](scenarios/S-025-diagnose-broken-setup.md) | Platform — Diagnose broken setup | solo-developer | P1 | manual |

### Workflows
| ID | Title | Persona | Priority | Automation |
|---|---|---|---|---|
| [S-002](scenarios/S-002-solo-first-workflow.md) | Solo — First Workflow | solo-developer | P0 | e2e-todo |
| [S-006](scenarios/S-006-workflow-create-yaml.md) | Workflow — Create from YAML | solo-developer | P0 | e2e-todo |
| [S-007](scenarios/S-007-workflow-run-with-inputs.md) | Workflow — Run with inputs | solo-developer | P0 | e2e-todo |
| [S-008](scenarios/S-008-workflow-cancel.md) | Workflow — Cancel running workflow | solo-developer | P1 | e2e-todo |
| [S-009](scenarios/S-009-workflow-history-logs.md) | Workflow — Run history and logs | solo-developer | P1 | e2e-todo |

### Plugins & Marketplace
| ID | Title | Persona | Priority | Automation |
|---|---|---|---|---|
| [S-003](scenarios/S-003-solo-plugin-author.md) | Solo — Create & Run Plugin | plugin-author | P1 | e2e-done |
| [S-013](scenarios/S-013-plugin-full-cycle.md) | Plugin — Full authoring cycle | plugin-author | P0 | e2e-done |
| [S-010](scenarios/S-010-marketplace-install-plugin.md) | Marketplace — Install plugin | solo-developer | P0 | manual |
| [S-011](scenarios/S-011-marketplace-enable-disable.md) | Marketplace — Enable / disable plugin | solo-developer | P1 | manual |
| [S-012](scenarios/S-012-marketplace-update-plugin.md) | Marketplace — Update plugin | solo-developer | P1 | manual |
| [S-026](scenarios/S-026-plugin-publish.md) | Plugin — Publish to marketplace | plugin-author | P1 | manual |

### AI Features
| ID | Title | Persona | Priority | Automation |
|---|---|---|---|---|
| [S-014](scenarios/S-014-ai-commit-with-llm.md) | AI Commit — with real LLM | solo-developer | P0 | e2e-done |
| [S-015](scenarios/S-015-ai-code-review.md) | AI Code Review | solo-developer | P0 | manual |
| [S-016](scenarios/S-016-mind-rag-search.md) | Mind — RAG search | solo-developer | P1 | manual |

### Gateway & Config
| ID | Title | Persona | Priority | Automation |
|---|---|---|---|---|
| [S-017](scenarios/S-017-gateway-own-key.md) | Gateway — Connect own LLM key | solo-developer | P0 | manual |
| [S-018](scenarios/S-018-gateway-switch-provider.md) | Gateway — Switch LLM provider | solo-developer | P1 | manual |
| [S-019](scenarios/S-019-gateway-usage-quota.md) | Gateway — Usage and quota | solo-developer | P1 | manual |

### Studio
| ID | Title | Persona | Priority | Automation |
|---|---|---|---|---|
| [S-020](scenarios/S-020-studio-first-login.md) | Studio — First login | solo-developer | P0 | manual |
| [S-021](scenarios/S-021-studio-workflow-runs.md) | Studio — View workflow runs | solo-developer | P1 | manual |
| [S-022](scenarios/S-022-studio-trigger-workflow.md) | Studio — Trigger workflow from UI | solo-developer | P1 | manual |

### Execution & Runtime
| ID | Title | Persona | Priority | Automation |
|---|---|---|---|---|
| [S-027](scenarios/S-027-workflow-live-progress.md) | Workflow — Live progress while running | solo-developer | P0 | e2e-todo |
| [S-028](scenarios/S-028-workflow-real-work.md) | Workflow — Does real work (shell/http/file) | solo-developer | P0 | e2e-todo |
| [S-029](scenarios/S-029-workflow-failure-visibility.md) | Workflow — Failure is visible and actionable | solo-developer | P0 | e2e-todo |
| [S-030](scenarios/S-030-long-running-command.md) | Plugin command — Long-running, cancellable | solo-developer | P1 | manual |
| [S-031](scenarios/S-031-session-expired.md) | Session expired — clear prompt to re-login | solo-developer | P1 | manual |
| [S-032](scenarios/S-032-workflow-webhook.md) | Workflow — Sends webhook on completion | solo-developer | P1 | manual |

### Team (requires VPS / team setup)
| ID | Title | Persona | Priority | Automation |
|---|---|---|---|---|
| [S-004](scenarios/S-004-team-admin-cloud-deploy.md) | Team Admin — Cloud Deploy | team-admin | P0 | manual |
| [S-005](scenarios/S-005-team-member-connect.md) | Team Member — Connect to Cloud | team-member | P1 | manual |

---

## Run Log

| Date | Scope | Result | Link |
|---|---|---|---|
| 2026-06-05 | S-001, S-002 (old binaries) + S-001 (2.94.0) | ❌ FAIL | [runs/2026-06-05.md](runs/2026-06-05.md) |
