# ADR-0012: Runtime Observability and Tracing Strategy

**Date:** 2025-11-08  
**Status:** Accepted  
**Deciders:** KB Labs Team  
**Last Reviewed:** 2025-11-08  
**Tags:** [observability, runtime, architecture]

## Context

As the plugin runtime gained richer orchestration (invoke chains, event bus, artifact broker), understanding execution flow became non-trivial:

- Debugging required correlating emits/invokes/artifacts across sandbox processes.
- Failures were hard to triage without structured traces or analytics events.
- Developers (and ops) needed consistent logs, snapshots, metrics regardless of adapter.

Previously observability was fragmented: ad hoc console logs, scattered analytics calls, snapshots only on certain errors. We needed a unified strategy that works in both in-process and subprocess modes, supports CLI/REST tooling, and can evolve toward external collectors later.

## Decision

Standardize observability around three pillars embedded in the runtime:

1. **Structured Analytics Events**
   - All major actions emit analytics via `emitAnalyticsEvent` (`plugin.exec.started/completed/failed`, `plugin.events.emit/received/denied/dropped`, `plugin.permission.denied`, `plugin.artifact.saved`, etc.).
   - Analytics emitter is best-effort (never throws) and can be wired to future backends.
   - Event payloads include `pluginId`, `pluginVersion`, `routeOrCommand`, `traceId`, `requestId`, timing data.

2. **Tracing & Snapshots**
   - Invoke broker generates trace spans (`TraceSpan`) with parent/child relationships, saved to disk (`trace.ts`) via `saveTrace` + rotation helpers (`rotateTraces`).
   - Snapshot system captures input/context/logs on errors and stores them under `.kb/debug/snapshots`, accessible via CLI (`kb debug replay`, `kb debug trace`).
   - CLI debug commands consume unified trace/snapshot format (JSON) to inspect timeline, flamegraphs, etc.

3. **Runtime Logging & Redaction**
   - Sandbox intercepts `console.*` and forwards logs through IPC with structured metadata (level, timestamp); CLI debug renders formatted output, honors `--debug` detail level.
   - Event bus logging uses redaction policy (configurable `redactKeys`) to mask sensitive data before analytics or debug output.
   - Error envelopes include sanitized permission summaries and, when available, stack traces (without leaking secrets).

Additional support:

- Context propagation ensures `traceId`, `spanId`, `requestId` flow through invokes and events (including subprocess bridge).
- Metrics (timeMs, cpuMs, memMb) recorded uniformly in `ExecuteResult`, snapshots, analytics.
- Debug profiles (`--debug=profile`) export Chrome Trace format for performance analysis.

## Consequences

### Positive

- End-to-end visibility for multi-agent flows: traces + analytics + event logs align via shared IDs.
- Consistent failure artefacts (snapshots) simplify reproduction (`kb debug replay`).
- Observability works out-of-the-box in local CLI and scales to distributed setups via analytics emitter hooks.
- Redaction reduces risk of leaking sensitive data in logs.

### Negative

- Additional disk usage for snapshots/traces (mitigated by rotation limits).
- Analytics emitter currently local; without backend integration, events remain on disk/logs.
- Developers must understand trace IDs to correlate events (needs tooling/docs).

### Alternatives Considered

- **Rely solely on external APM (OpenTelemetry)** — postponed to avoid infrastructure requirements and keep MVP self-contained.
- **Minimal logging only** — rejected; insufficient for multi-agent debugging and auditing.
- **Per-plugin custom observability** — rejected; leads to inconsistent tooling and higher support cost.

## Implementation

- Analytics: `packages/runtime/src/analytics.ts`, emitted across runtime modules.
- Traces: `packages/runtime/src/trace.ts`, invoke broker integration, CLI trace commands.
- Snapshots: `packages/runtime/src/snapshot.ts`, CLI replay tooling.
- Event bus instrumentation: `packages/runtime/src/events/event-bus.ts`.
- Sandbox logging bridge: `packages/runtime/src/sandbox/child/runtime.ts`, `node-subproc.ts`.
- CLI debug commands: `packages/adapters/cli/src/commands/debug/*`.
- Redaction config: event bus runtime (`redactKeys`), error envelopes sanitized fields.
- Future work: optional OpenTelemetry/OTLP exporter, centralized metrics aggregation (target review 2026-05-01).

## References

- Analytics emitter — `packages/runtime/src/analytics.ts`
- Traces — `packages/runtime/src/trace.ts`, CLI debug trace commands
- Snapshots — `packages/runtime/src/snapshot.ts`, CLI replay
- Event bus analytics — `packages/runtime/src/events/event-bus.ts`
- CLI debug tooling — `packages/adapters/cli/src/commands/debug/*`

---

**Last Updated:** 2025-11-08  
**Next Review:** 2026-05-01

