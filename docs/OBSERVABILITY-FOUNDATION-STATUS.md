# Observability Foundation Status

## Purpose
This document is the baseline for the pre-plugin observability layer.

Rule:
- services expose standardized observability facts
- compliance tooling verifies contract support
- future plugin consumes the contract without service-specific logic

Decision record:
- ADR: [`ADR-0055: Observability Telemetry Foundation Before Plugin`](/Users/kirillbaranov/Desktop/kb-labs-workspace/platform/kb-labs-core/docs/adr/0055-observability-telemetry-foundation-before-plugin.md)

## Canonical HTTP Surfaces
- `/health` — cheap public service health
- `/ready` — readiness gate
- `/observability/describe` — service identity, capabilities, contract version
- `/observability/health` — structured runtime diagnostics
- `/metrics` — canonical Prometheus snapshot

## Contract Baseline
- Contract source of truth: `@kb-labs/core-contracts`
- Current schema: `kb.observability/1`
- Current contract version: `1.0`
- Compatibility mode: capability-driven, additive within current major version

## Architectural Model

Principle:
- services publish facts
- plugin builds meaning

Telemetry layers:
- shared HTTP collector publishes runtime and HTTP facts:
  - CPU
  - RSS
  - heap
  - event loop lag
  - active operations
  - HTTP route metrics
  - HTTP `topOperations`
- shared operation tracker publishes bounded non-HTTP domain facts:
  - canonical `service_operation_total`
  - canonical `service_operation_duration_ms`
  - non-HTTP `topOperations`

Design rules:
- no service-specific collector logic in the foundation
- no consumer-specific wire formats as source of truth
- no analysis, incidents, or diagnosis inside services
- new service onboarding must be `contract + compliance`, not `patch plugin`

## Compliance Command
- Human: `pnpm observability:check`
- JSON: `pnpm observability:check:json`
- Reasons: `pnpm observability:reasons`
- Reasons JSON: `pnpm observability:reasons:json`

The compliance command verifies:
- canonical endpoints are reachable
- `describe` and `observability/health` payloads are valid
- `contractVersion` is present
- capabilities are valid
- canonical metric families exist in `/metrics`
- log correlation is ready
- domain operation metrics are ready

## Critical-Path Diagnostics Baseline

Critical plugin and workflow failures must emit structured diagnostic logs with:
- `diagnosticDomain`
- `diagnosticEvent`
- `reasonCode`
- stable service correlation fields
- bounded evidence payloads

Current baseline reason codes include:
- `snapshot_stale`
- `snapshot_partial`
- `registry_restore_failed`
- `manifest_missing`
- `manifest_invalid`
- `manifest_load_timeout`
- `plugin_discovery_failed`
- `handler_not_found`
- `execution_host_unavailable`
- `execution_dispatch_failed`
- `route_validation_failed`
- `route_mount_failed`
- `ws_mount_failed`
- `registry_refresh_failed`
- `upstream_unavailable`
- `websocket_auth_failed`
- `websocket_hello_timeout`
- `websocket_handshake_invalid`
- `websocket_protocol_unsupported`
- `websocket_message_invalid`
- `adapter_call_rejected`
- `adapter_bridge_unavailable`
- `workspace_provision_failed`
- `workspace_provision_timeout`
- `worker_loop_error`

Current critical-path coverage:
- `rest` emits structured diagnostics for registry snapshot drift, discovery diagnostics, route validation failures, route mount failures, and WebSocket mount failures
- `rest /plugins/refresh` emits `registry_refresh_failed`
- `plugin-execution-factory` emits `handler_not_found` before returning execution errors
- `workflow` emits structured diagnostics for workspace provisioning failures and worker loop failures
- `gateway` emits structured diagnostics for upstream health degradation and host-registry restore failures
- `gateway /api/v1/execute` emits `execution_host_unavailable` and `execution_dispatch_failed`
- `gateway /hosts/connect` emits structured diagnostics for auth rejection, hello timeout, invalid handshake/message, and adapter bridge failures

## Log Correlation Baseline

Canonical structured log fields come from `@kb-labs/core-contracts`.

Always present on structured service logs:
- `serviceId`
- `instanceId`
- `logsSource`

Present on request-scoped and operation-scoped logs where applicable:
- `requestId`
- `reqId`
- `traceId`
- `operation`
- `route`
- `method`
- `url`

Rules:
- `route` is normalized and template-based
- `operation` uses bounded domain names
- services should emit these fields through shared helpers, not local ad hoc logger wrappers
- `logCorrelationReady` means the service advertises `logCorrelation`, exposes a stable `logsSource`, and publishes usable operation context through observability health and metrics

## Service Status Matrix

| Service | Health | Ready | Describe | Obs Health | Metrics | Compliance |
|---|---|---|---|---|---|---|
| `state-daemon` | Yes | Yes | Yes | Yes | Yes | Compliant |
| `workflow` | Yes | Yes | Yes | Yes | Yes | Compliant |
| `rest` | Yes | Yes | Yes | Yes | Yes | Compliant |
| `marketplace` | Yes | Yes | Yes | Yes | Yes | Compliant |
| `gateway` | Yes | Yes | Yes | Yes | Yes | Compliant |

Current quality baseline:
- `logCorrelationReady`: `5/5`
- `domainMetricsReady`: `5/5`

Signal enrichment baseline:
- `workflow` publishes runtime families such as `workflow.catalog.refresh`, `workflow.run.list`, `workflow.job.submit`
- `rest` publishes runtime families such as `cache.invalidate`, `plugin.registry.list`, `openapi.plugin.get`, `openapi.plugins.aggregate`
- `state-daemon` publishes runtime families such as `state.health`, `state.stats`, `state.get`, `state.set`, `state.clear`
- `marketplace` publishes runtime families such as `marketplace.list`, `marketplace.doctor`, `marketplace.sync`, `marketplace.install`
- `gateway` publishes runtime families such as `gateway.upstream.rest.health`, `gateway.upstream.workflow.health`, `gateway.adapter.llm`

## Rollout Definition Of Done
- service exposes all canonical HTTP surfaces
- `pnpm observability:check:json` reports the service as `compliant`
- no legacy observability endpoint is used as canonical source
- `/metrics` is safe to poll and returns canonical metric families
- `/observability/describe` includes valid `contractVersion` and capabilities
- `/observability/health` includes checks, snapshot, and top operations where applicable
- non-HTTP domain operations are published through canonical `service_operation_*` metrics
- logs are attributable to a stable service source

## Known Notes
- `rest` may report `degraded` in observability health while still being compliant if checks include warnings such as plugin route mounting state
- `workflow` may show high CPU during active workload; compliance only verifies contract support, not load behavior
- `topOperations` is a ranked top-N view, not a complete inventory; full operation coverage must be verified via canonical `service_operation_*` metric families in `/metrics`
- current pre-plugin observability APIs outside the canonical service layer are not the source of truth for this foundation

## Non-Goals Before Plugin
- no incidents engine
- no trend/history store
- no anomaly detector
- no service-specific analytics in collectors

## Next Foundation Work
- keep Studio and other consumers on canonical contract-only inputs
- tighten correlation hygiene around subsystem and dependency logs where third-party libraries still bypass platform logging
- finish gateway-specific signal hardening after the current concurrent gateway work is complete
