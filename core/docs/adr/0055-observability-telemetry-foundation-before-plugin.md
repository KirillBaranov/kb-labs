# ADR-0055: Observability Telemetry Foundation Before Plugin

**Date:** 2026-04-01
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2026-04-01
**Tags:** [observability, telemetry, contracts, services, plugins, architecture]

## Context

KB Labs needs an observability layer that works across many services without turning the future plugin into a collection of service-specific adapters.

The core requirements are:
- a new service must connect through `contract + compliance`
- services must not require plugin patches to become observable
- observability data must be usable by humans, agents, and future diagnosis tooling
- legacy per-service payloads and ad hoc metrics must not become the new foundation

Before this decision, KB Labs had fragments of observability in multiple places:
- point-in-time health endpoints
- partial metrics payloads
- consumer-specific wire formats
- service-local conventions for runtime data

That was enough to inspect individual services, but not enough to support a generic plugin that can scrape, correlate, and analyze the platform as a whole.

## Decision

We establish a pre-plugin observability foundation with this rule:

`services publish facts, plugin builds meaning`

### 1. Canonical service surfaces

Every HTTP service exposes the same observability surfaces:
- `/health` — cheap public service health
- `/ready` — readiness gate
- `/observability/describe` — service identity, capabilities, contract version
- `/observability/health` — structured runtime diagnostics
- `/metrics` — canonical Prometheus snapshot

The canonical contract lives in `@kb-labs/core-contracts`.

### 2. Capability-driven contract

Services describe observability support through:
- `contractVersion`
- canonical metric families
- `capabilities`

The platform consumes capability flags instead of branching on `serviceId`.

This means:
- additive evolution stays within the contract
- partial support degrades cleanly
- new services do not require collector-specific code

### 3. Generic telemetry split

Services publish two layers of telemetry:

1. **Generic runtime and HTTP facts**
   Produced through the shared HTTP observability collector.
   Includes:
   - CPU
   - RSS
   - heap
   - event loop lag
   - active operations
   - HTTP request counts, durations, errors
   - HTTP `topOperations`

2. **Generic domain operation facts**
   Produced through a reusable operation tracker.
   Includes bounded non-HTTP operations such as:
   - `registry.init`
   - `plugin.routes.mount`
   - `state.get`
   - `marketplace.sync`
   - `gateway.upstream.rest.health`

These operations are emitted through canonical metric families:
- `service_operation_total{operation=...,status=...}`
- `service_operation_duration_ms{operation=...,status=...}`

And are surfaced in structured health payloads via `topOperations`.

Representative runtime families already proven in the foundation:
- `workflow.catalog.refresh`, `workflow.run.list`, `workflow.job.submit`
- `cache.invalidate`, `plugin.registry.list`, `openapi.plugin.get`
- `state.health`, `state.stats`, `state.get`, `state.set`
- `marketplace.list`, `marketplace.doctor`, `marketplace.sync`
- `gateway.upstream.rest.health`, `gateway.adapter.llm`

### 3.1 Canonical log correlation fields

Structured logs participate in the same foundation and use one shared vocabulary.

Canonical service correlation fields are:
- `serviceId`
- `instanceId`
- `logsSource`
- `requestId`
- `reqId`
- `traceId`
- `operation`
- `route`
- `method`
- `url`

Rules:
- `serviceId`, `instanceId`, and `logsSource` identify the producing service
- `route` is normalized and template-based
- `operation` uses bounded domain names
- shared helpers must normalize and emit these fields instead of local per-service wrappers

This keeps future plugin-side log correlation generic and prevents service-specific parsing logic.

### 3.2 Critical-path diagnostics logging

Structured logs are also the first source of truth for "why did this fail to load?" investigations.

Critical plugin and workflow paths must emit bounded diagnostic events with:
- `diagnosticDomain`
- `diagnosticEvent`
- `reasonCode`
- shared service correlation fields
- structured evidence

This layer covers failures such as:
- stale or partial registry snapshots
- manifest load and validation failures
- handler resolution failures
- route and WebSocket mount failures
- gateway execution dispatch failures
- gateway host WebSocket auth, handshake, and adapter bridge failures
- workspace provisioning failures

The foundation standardizes reason codes so both humans and agents can filter and explain failures without service-specific parsing.

### 4. No service-specific plugin knowledge

The future observability plugin must remain an abstract consumer of the standard.

Therefore:
- base ingestion must not branch on concrete service identities
- service-specific dashboard payloads are not part of the foundation
- services do not emit incidents or analysis in the pre-plugin phase
- the plugin will later build trends, correlation, anomaly detection, incidents, and diagnosis from standardized telemetry

### 5. Compliance first

Before plugin work, KB Labs validates foundation quality through compliance tooling:
- canonical routes must exist
- `describe` and `observability/health` must validate
- canonical metrics must exist
- log correlation must be present
- non-HTTP domain operations must be present where `operationMetrics` is declared

This creates a stable onboarding model:

`new service support = implement contract + pass compliance`

not:

`new service support = patch plugin`

## Consequences

### Positive

- New services can become observable without plugin code changes.
- HTTP services share one operational model and one compliance gate.
- Future plugin work can focus on history, correlation, incidents, and diagnosis instead of service onboarding.
- Domain-level operations provide root-cause context instead of only symptom metrics.
- Human and agent consumers can use the same structured telemetry model.

### Negative

- Services must adopt the shared collector and operation tracker patterns instead of inventing local formats.
- Teams need to choose bounded operation names carefully to avoid high-cardinality drift.
- Some services will initially expose only minimal domain operations and need iterative enrichment later.

### Non-Goals

This decision does not add:
- incident generation
- anomaly detection
- history/trend storage
- diagnosis summaries
- service-specific plugin enrichers

These belong to the future plugin phase.

## Implementation Notes

The foundation is implemented through:
- observability contracts in `@kb-labs/core-contracts`
- shared service helpers in `@kb-labs/shared-http`
- generic HTTP collector for runtime and HTTP metrics
- generic operation tracker for bounded non-HTTP operations
- compliance command `pnpm observability:check`

Validation rule:
- `topOperations` is a ranked operational summary
- canonical `service_operation_*` metrics are the complete source of truth for operation coverage

## Related Documents

- [`/Users/kirillbaranov/Desktop/kb-labs-workspace/docs/OBSERVABILITY-FOUNDATION-STATUS.md`](/Users/kirillbaranov/Desktop/kb-labs-workspace/docs/OBSERVABILITY-FOUNDATION-STATUS.md)
- [ADR-0044: Unified Log Query Service](./0044-unified-log-reader-adapter.md)
