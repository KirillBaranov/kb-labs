# KB Labs REST API — Architecture

## Overview

The REST API now acts as a lightweight gateway that reflects whatever plugins are discovered in the KB Labs workspace. Instead of embedding service logic for audit, release, or other tools, the server focuses on:

- discovering plugin manifests (v2) at startup and on changes
- mounting each plugin's REST handlers under the configured base path
- exposing shared system endpoints (health, metrics, OpenAPI, plugin registry)
- applying common middleware such as request envelopes, security headers, CORS, and rate limiting

This keeps the runtime small, predictable, and aligned with the plugin ecosystem that Studio and other clients consume.

## Components

| Component | Responsibility |
|-----------|----------------|
| **Fastify server** (`apps/rest-api`) | Boots Fastify, registers middleware, mounts system routes, and wires plugin routes via the plugin runtime. |
| **Plugin runtime** (`@kb-labs/plugin-runtime`) | Validates manifests, executes plugin REST handlers, and provides capability checks. |
| **Config layer** (`@kb-labs/rest-api-core`) | Supplies the Zod schema, loader, and environment mapping for REST API configuration. |
| **CLI registry** (`@kb-labs/cli-api`) | Discovers plugins from the workspace and emits registry snapshots used by health/debug endpoints. |

## Request Flow

```
HTTP request
  → Fastify middleware (security headers, request ID, envelope, metrics)
  → System routes (health / metrics / registry) or plugin route mounted by manifest
  → Optional mock-mode handling (per request header or config)
  → Response wrapped in `{ ok, data, meta }`
```

## Plugin Mounting Lifecycle

1. During bootstrap the server loads configuration via `loadRestApiConfig()` and finds the monorepo root.
2. CLI discovery locates plugins and produces a registry snapshot.
3. `registerPluginRoutes()` validates REST handlers referenced in each manifest and mounts them under `config.basePath`.
4. Validation warnings are logged but never crash the server; problematic plugins are skipped.
5. The plugin registry endpoint (`/api/v1/plugins/registry`) returns the manifests so clients can introspect mounted routes.

## Shared Endpoints

- `GET /health` — public service health snapshot (`kb.health/1`), cheap and human-readable
- `GET /ready` — readiness gate (`kb.ready/1`) for startup/orchestration decisions
- `GET /observability/describe` — versioned observability contract descriptor
- `GET /observability/health` — structured runtime health for collectors, Studio, and agents
- `GET /openapi.json` — aggregated OpenAPI document
- `GET /openapi/:pluginId` — per-plugin OpenAPI document
- `GET /api/v1/plugins/registry` — plugin manifest registry for Studio
- `GET /api/v1/metrics` — canonical Prometheus metrics snapshot

## Metrics & Observability

Metrics are collected by middleware and include:

- canonical runtime gauges: CPU, RSS, heap used, event loop lag, active operations, service health
- total requests, per-method, per-status counters
- latency totals with average, min, max, plus per-route budgets (when manifests define timeouts)
- error counters keyed by error code
- canonical service operation counters and duration histograms (`service_operation_*`)
- per-plugin aggregates (`kb_plugin_request_*`) tracking success/error ratios and latency spikes
- uptime information (process start time, last request timestamp)

The endpoint roles are intentionally split:

- `/health` answers “is the service alive and what is its current high-level state?”
- `/ready` answers “can this instance safely receive traffic right now?”
- `/observability/describe` answers “what observability contract and capabilities does this service expose?”
- `/observability/health` answers “what runtime/load context does the service expose for diagnostics?”

`/api/v1/metrics` is the single canonical metrics surface. Logs use Pino with request IDs for correlation.

## Configuration

`@kb-labs/rest-api-core` exposes a Zod schema via `restApiConfigSchema`. Key settings:

| Field | Description |
|-------|-------------|
| `port` | Server port (default `5050`) |
| `basePath` | API base path (default `/api/v1`) |
| `apiVersion` | Injected into envelope metadata |
| `cors` | Origins, credentials, and profile (`dev`, `preview`, `prod`) |
| `timeouts` | Optional request timeout and body limit overrides |
| `rateLimit` | Optional Fastify rate-limit settings |
| `plugins` | Granted capabilities for plugin handlers (array of strings) |
| `mockMode` | Enable global mock mode |

Environment variables with `KB_REST_*` prefixes map onto these fields (see `README.md` for examples).

## Diagnostics & Shutdown

- The CLI registry publishes change events; the server logs summary counts when plugins are added/removed.
- Graceful shutdown disposes the CLI API and stops the Fastify server.
- No background workers run—the cleanup task and queue executor were removed with the legacy services.
