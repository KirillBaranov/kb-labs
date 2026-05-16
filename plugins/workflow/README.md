# @kb-labs/workflow

> Workflow orchestration — run, schedule, and monitor multi-step jobs.

![license](https://img.shields.io/badge/license-MIT-green)
![platform](https://img.shields.io/badge/kb--labs-%3E%3D0.1.0-orange)
![tags](https://img.shields.io/badge/tags-workflow%20%7C%20jobs%20%7C%20cron%20%7C%20orchestration-lightgrey)

---

## Overview

Workflow provides a daemon (`:7778`) that executes multi-step jobs, manages a
job queue, and runs cron schedules. The CLI plugin connects to the daemon over
HTTP and gives you full visibility into runs, jobs, and logs. You define
workflows as code — the engine handles retries, prioritization, cancellation,
and approval gates.

---

## Features

- Job queue with priority and retry support
- Cron scheduling — define recurring workflows with cron expressions
- Approval gates — pause a run and wait for human or programmatic sign-off
- Real-time log and progress streaming over WebSocket
- Re-run failed runs from the point of failure
- Cancellation at job or run level
- Studio UI — dashboard, run history, definition browser, job queue, cron list

---

## Requirements

**KB Labs platform** `>= 0.1.0`

**Services**

The workflow CLI plugin connects to the workflow daemon over HTTP. No platform
services (LLM, cache, etc.) are required by the CLI itself — those are consumed
by the workflow handlers running inside the daemon.

**Environment variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WORKFLOW_DAEMON_URL` | No | `http://localhost:7778` | Workflow daemon URL |

---

## Installation

```bash
pnpm kb marketplace install @kb-labs/workflow-entry
```

The workflow daemon is started automatically by `kb-dev start`.

---

## Commands

### Daemon

```bash
kb workflow health                     # check daemon is up
kb workflow metrics                    # queue stats: running, queued, completed, failed
```

### Runs

```bash
kb workflow runs-list                  # list all workflow runs
kb workflow runs-list --status=failed
kb workflow runs-list --workflow=release-manager/create-release
kb workflow runs-view <runId>          # full run details: jobs, steps, inputs, errors
kb workflow runs-view <runId> --log-failed   # only failed step logs (fastest root cause)
kb workflow runs-watch <runId>         # stream run events live
kb workflow runs-rerun <runId>         # resubmit with same inputs
```

### Running workflows

```bash
kb workflow run --workflow-id=release-manager/create-release
kb workflow run --workflow-id=my-workflow --isolation=strict
```

### Jobs

```bash
kb workflow status --job-id=abc123     # job state + timing
kb workflow logs   --job-id=abc123     # execution logs
kb workflow logs   --job-id=abc123 --follow  # stream logs live
kb workflow list                       # active jobs
kb workflow list   --status=running
kb workflow list   --type=cron
kb workflow job-run --handler=mind:rag-query --input='{"text":"test"}' --wait
```

**Full command reference**

| Command | Description |
|---------|-------------|
| `kb workflow health` | Daemon health check |
| `kb workflow metrics` | Queue statistics |
| `kb workflow status` | Job state + timing |
| `kb workflow logs` | Job execution logs |
| `kb workflow list` | List active jobs |
| `kb workflow job-run` | Submit a raw job |
| `kb workflow run` | Run a workflow by ID |
| `kb workflow runs-list` | List all runs |
| `kb workflow runs-view` | Full run details |
| `kb workflow runs-watch` | Stream run events live |
| `kb workflow runs-rerun` | Re-run a workflow |

---

## REST API

Base path: `/plugins/workflow`

Requires the `gateway` plugin.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/plugins/workflow/stats` | Dashboard statistics |
| `GET` | `/plugins/workflow/workflows` | List workflow definitions |
| `GET` | `/plugins/workflow/workflows/:id` | Workflow definition detail |
| `POST` | `/plugins/workflow/workflows/:id/run` | Start a workflow run |
| `GET` | `/plugins/workflow/workflows/:id/runs` | Run history for a workflow |
| `POST` | `/plugins/workflow/workflows/runs/:runId/cancel` | Cancel a run |
| `GET` | `/plugins/workflow/runs` | All runs across all workflows |
| `GET` | `/plugins/workflow/runs/:runId` | Run detail |
| `GET` | `/plugins/workflow/workflows/jobs` | List jobs |
| `GET` | `/plugins/workflow/workflows/jobs/:jobId` | Job detail |
| `GET` | `/plugins/workflow/workflows/jobs/:jobId/logs` | Job logs |
| `GET` | `/plugins/workflow/workflows/jobs/:jobId/steps` | Job steps |
| `POST` | `/plugins/workflow/workflows/jobs/:jobId/cancel` | Cancel a job |
| `GET` | `/plugins/workflow/workflows/cron` | List cron jobs |
| `GET` | `/plugins/workflow/runs/:runId/pending-approvals` | List pending approvals |
| `POST` | `/plugins/workflow/runs/:runId/approve` | Resolve an approval gate |

**WebSocket** — `/v1/ws/plugins/workflow`

| Channel | Description |
|---------|-------------|
| `/logs/:jobId` | Real-time job log stream |
| `/progress/:jobId` | Real-time job progress updates |

---

## Studio

Adds a **Workflows** section to KB Labs Studio (sidebar order 10).

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/p/workflows` | Queue metrics and recent activity |
| Runs | `/p/workflows/runs` | Run history with status filter |
| Run Detail | `/p/workflows/runs/:runId` | Steps, logs, approval gates |
| Definitions | `/p/workflows/definitions` | Registered workflow definitions |
| Definition Detail | `/p/workflows/definitions/:workflowId` | Definition + run history |
| Jobs | `/p/workflows/jobs` | Job queue browser |
| Crons | `/p/workflows/crons` | Scheduled cron jobs |

---

## Permissions

| Category | Scope | Reason |
|----------|-------|--------|
| Network | `http://localhost:*`, `http://127.0.0.1:*` | HTTP calls to workflow daemon |
| Environment | `WORKFLOW_DAEMON_URL` | Daemon URL override |
| Quotas | 30 sec timeout, 128 MB RAM | Lightweight HTTP client |

---

## Changelog

### 1.0.0

- Initial release: health, metrics, status, logs, list, job-run, run, runs-list/view/watch/rerun commands
- REST API + WebSocket proxy to workflow daemon
- Studio: Dashboard, Runs, Definitions, Jobs, Crons

---

## License

MIT
