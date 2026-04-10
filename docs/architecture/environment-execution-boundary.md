# Environment and Execution Boundary

## Purpose

This document fixes architectural boundaries for full-cycle orchestration.

## Core Separation

- `ExecutionBackend` is the plugin/job dispatch layer.
  - Responsibilities: execute handlers, scale runners, isolate failures.
  - Non-responsibilities: provision/destroy infrastructure environments.

- `EnvironmentProvider` is the long-lived environment lifecycle layer.
  - Responsibilities: create, inspect, renew lease, destroy environments.
  - Non-responsibilities: plugin/job routing and dispatch.

- `RunExecutor` is the only bridge between environment context and execution context.

- `RunOrchestrator` controls state machine transitions and does not invoke plugin handlers directly.

## Dependency Token Rule (Adapter Loader)

`requires.adapters[].id` must reference runtime adapter tokens (keys from `platform.adapters`), not `manifest.id`.

Example:

- Config:
  - `platform.adapters.cache = "@kb-labs/adapters-redis"`
- Provider manifest:
  - `manifest.id = "redis-cache"`
- Valid dependency:
  - `requires.adapters = ["cache"]`
- Invalid dependency:
  - `requires.adapters = ["redis-cache"]`

Rationale:

- Runtime wiring is based on configured adapter tokens.
- Multiple providers can implement the same token without changing dependent adapters.

## Persistence Strategy

- Environment leases are persisted in SQL (`ISQLDatabase`) as source of truth.
  - Suggested tables: `environment_leases`, `environment_events`.
- Cache (`ICache`, e.g. Redis) is optional and used for ephemeral coordination only.
  - Examples: lock, heartbeat, short-lived dedupe.

## Full-Cycle Review Outcome

- Human review reject must use `failed_by_review`.
- `cancelled` is reserved for explicit interruption/cancel flows.

## Invariants

- Every run has deterministic cleanup path for success/failure/cancel.
- Environment destroy operations must be idempotent.
- ExecutionBackend cannot own environment lifecycle state.

## Minimal Config Example

```json
{
  "adapters": {
    "logger": "@kb-labs/adapters-pino",
    "db": "@kb-labs/adapters-sqlite",
    "environment": "@kb-labs/adapters-environment-docker"
  },
  "adapterOptions": {
    "db": {
      "filename": ".kb/runtime.db"
    },
    "environment": {
      "defaultImage": "node:20-alpine",
      "defaultTtlMs": 3600000,
      "mountWorkspace": true,
      "workspaceMountPath": "/workspace",
      "janitorIntervalMs": 60000,
      "janitorBatchSize": 25
    }
  },
  "execution": {
    "mode": "worker-pool"
  }
}
```
