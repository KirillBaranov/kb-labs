# KB Labs Workflow E2E Checklist

> Auto-generated — do not edit manually.

```
Last run: 2026-05-19T10:55:33.930Z
Passed: 21  Failed: 38  Planned: 4
```

## Cli

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| — | CJ-RR-01: kb workflow runs rerun <runId> --json returns a new runId | `cli/rerun.spec.ts` | ❌ FAILED |
| — | CJ-RR-02: rerun nonexistent runId exits 1 | `cli/rerun.spec.ts` | ⚠️ skipped |
| — | CJ-RL-01: kb workflow runs list exits 0 | `cli/runs-list.spec.ts` | ❌ FAILED |
| — | CJ-RL-02: kb workflow runs list --json returns an array | `cli/runs-list.spec.ts` | ⚠️ skipped |
| — | CJ-RL-03: kb workflow runs list --limit 5 exits 0 | `cli/runs-list.spec.ts` | ⚠️ skipped |
| — | CJ-RL-04: kb workflow runs list --status success exits 0 | `cli/runs-list.spec.ts` | ⚠️ skipped |
| — | CJ-H01: kb workflow health exits 0 and prints status | `cli/health.spec.ts` | ✅ covered |
| — | CJ-M01: kb workflow metrics exits 0 | `cli/metrics.spec.ts` | ✅ covered |
| — | CJ-H02: kb workflow health --json returns { ok: true } | `cli/health.spec.ts` | ✅ covered |
| — | CJ-M02: kb workflow metrics --json returns runs and jobs counters | `cli/metrics.spec.ts` | ✅ covered |
| — | CJ-WR-01: kb workflow run --workflow-id=<id> --json returns runId | `cli/workflow-run.spec.ts` | ✅ covered |
| — | CJ-RV-01: kb workflow runs view <runId> exits 0 | `cli/runs-view.spec.ts` | ❌ FAILED |
| — | CJ-RV-02: kb workflow runs view <runId> --json=all returns run detail | `cli/runs-view.spec.ts` | ⚠️ skipped |
| — | CJ-RV-03: nonexistent runId exits 1 | `cli/runs-view.spec.ts` | ⚠️ skipped |
| — | CJ-RV-04: kb workflow runs view <runId> --log exits 0 | `cli/runs-view.spec.ts` | ⚠️ skipped |
| — | CJ-WR-02: missing --workflow-id exits 1 with error | `cli/workflow-run.spec.ts` | ✅ covered |
| — | CJ-RW-01: kb workflow runs watch exits 0 when run.finished | `cli/runs-watch.spec.ts` | ❌ FAILED |
| — | CJ-WR-03: invalid --isolation exits 1 | `cli/workflow-run.spec.ts` | ✅ covered |
| — | CJ-RW-02: kb workflow runs watch exits 1 when run fails | `cli/runs-watch.spec.ts` | ❌ FAILED |
| — | CJ-RW-03: kb workflow runs watch --json emits JSON events per line | `cli/runs-watch.spec.ts` | ❌ FAILED |
| — | CJ-WR-04: --json output can be piped (stdout is valid JSON) | `cli/workflow-run.spec.ts` | ❌ FAILED |
| — | CJ-RW-04: missing runId exits 1 with error | `cli/runs-watch.spec.ts` | ✅ covered |

## Basic.spec.ts

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| W-01 | create workflow run returns run ID | `basic.spec.ts` | ❌ FAILED |
| W-02 | GET /runs/:id returns a valid initial status | `basic.spec.ts` | ❌ FAILED |
| W-03 | e2e-hello workflow reaches completed within 30s | `basic.spec.ts` | ❌ FAILED |
| W-04 | e2e-fail workflow reaches failed status within 30s | `basic.spec.ts` | ❌ FAILED |

## Discovery.spec.ts

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| WFD-01 | workflow catalog endpoint is accessible | `discovery.spec.ts` | ❌ FAILED |
| WFD-02 | cron catalog is populated from .kb/workflows | `discovery.spec.ts` | ❌ FAILED |
| WFD-03 | workflow refresh rescans .kb/workflows without restart | `discovery.spec.ts` | ❌ FAILED |
| WFD-04 | workflow found by name from .kb/workflows is runnable | `discovery.spec.ts` | ❌ FAILED |
| WFD-05 | workflow defined in projectRoot/.kb/workflows overrides platformRoot definition | `discovery.spec.ts` | 📋 planned |
| WFD-06 | invalid workflow YAML in .kb/workflows is reported in /ready diagnostics | `discovery.spec.ts` | 📋 planned |

## Engine.spec.ts

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| WF-01 | workflow stats endpoint responds with counts | `engine.spec.ts` | ❌ FAILED |
| WF-02 | workflow catalog is populated (e2e-hello is present) | `engine.spec.ts` | ❌ FAILED |
| WF-03 | e2e-hello run reaches terminal state within 30s | `engine.spec.ts` | ❌ FAILED |
| WF-04 | runs list is accessible and includes recent run | `engine.spec.ts` | ❌ FAILED |
| WF-05 | stats running count increases during active run | `engine.spec.ts` | ✅ covered |
| WF-06 | e2e-fail workflow ends with failed status | `engine.spec.ts` | ❌ FAILED |
| WF-07 | cron catalog endpoint is accessible | `engine.spec.ts` | ✅ covered |

## Plugin-templates.spec.ts

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| — | WFD-P01: plugin workflow templates appear in catalog | `plugin-templates.spec.ts` | ❌ FAILED |
| — | WFD-P02: plugin workflow template has source=plugin | `plugin-templates.spec.ts` | ❌ FAILED |
| — | WFD-P03: plugin workflow template has description | `plugin-templates.spec.ts` | ✅ covered |
| — | WFD-P04: plugin template is resolvable by ID | `plugin-templates.spec.ts` | ✅ covered |

## Runs.spec.ts

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| WR-01 | GET /runs — returns a runs array | `runs.spec.ts` | ❌ FAILED |
| WR-02 | GET /runs?status=success — returns only success runs | `runs.spec.ts` | ❌ FAILED |
| WR-03 | POST /workflows/:id/runs — returns a valid runId | `runs.spec.ts` | ✅ covered |
| WR-04 | GET /runs/:runId — returns run detail | `runs.spec.ts` | ✅ covered |
| WR-05 | run reaches terminal state within 30s | `runs.spec.ts` | ❌ FAILED |
| WR-06 | POST cancel — accepted for a running or pending run | `runs.spec.ts` | ✅ covered |
| WR-07 | GET /jobs — returns a jobs array | `runs.spec.ts` | ✅ covered |
| WR-08 | REST proxy GET /plugins/workflow/runs responds 200 | `runs.spec.ts` | 📋 planned |
| WR-09 | REST proxy — POST /plugins/workflow/workflows/:id/run returns runId | `runs.spec.ts` | 📋 planned |

## Sse

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| — | SE-B01: burst — all events received in order without loss | `sse/backpressure.spec.ts` | ❌ FAILED |
| — | SE-R01: reconnect does not duplicate live events | `sse/reconnect.spec.ts` | ❌ FAILED |
| — | SE-B02: no duplicate events even after burst | `sse/backpressure.spec.ts` | ❌ FAILED |
| — | SE-R02: run.finished is not missed on reconnect to already-terminal run | `sse/reconnect.spec.ts` | ❌ FAILED |
| — | SE-R03: rapid reconnect delivers run.finished without data loss | `sse/reconnect.spec.ts` | ❌ FAILED |
| — | SE-B03: stream does not hang after terminal event | `sse/backpressure.spec.ts` | ❌ FAILED |
| SE-01 | run.snapshot arrives first, terminal event closes stream | `sse/runs-events.spec.ts` | ❌ FAILED |
| SE-02 | no duplicate events in the stream | `sse/runs-events.spec.ts` | ❌ FAILED |
| SE-03 | already-terminal run closes stream immediately (< 3s) | `sse/runs-events.spec.ts` | ❌ FAILED |
| SE-04 | invalid runId returns 404, not an SSE stream | `sse/runs-events.spec.ts` | ❌ FAILED |
| SE-05 | multiple simultaneous subscribers receive same events | `sse/runs-events.spec.ts` | ❌ FAILED |

## Ws

| ID | Scenario | Spec | Status |
|----|----------|------|--------|
| — | WS-L01: subscribe → receive log stream | `ws/logs-channel.spec.ts` | ✅ covered |
| — | WS-P01: subscribe → server acknowledges (partial implementation) | `ws/progress-channel.spec.ts` | ✅ covered |
| — | WS-P02: unknown jobId → error message, no hang | `ws/progress-channel.spec.ts` | ✅ covered |
| — | WS-L02: level filter — warn level excludes debug/info messages | `ws/logs-channel.spec.ts` | ✅ covered |
| — | WS-L03: unknown jobId — server sends error message, does not hang | `ws/logs-channel.spec.ts` | ✅ covered |
| — | WS-L04: unsubscribe stops the log stream | `ws/logs-channel.spec.ts` | ❌ FAILED |
| — | WS-L05: client disconnect does not leak — server handles cleanup | `ws/logs-channel.spec.ts` | ❌ FAILED |
