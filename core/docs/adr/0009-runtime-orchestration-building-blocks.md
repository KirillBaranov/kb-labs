# ADR-0009: Runtime Orchestration Building Blocks (Invoke, Artifacts, Events)

**Date:** 2025-11-08  
**Status:** Accepted  
**Deciders:** KB Labs Team  
**Last Reviewed:** 2025-11-08  
**Tags:** [architecture, runtime, orchestration]

## Context

Multi-agent workflows in the KB Labs ecosystem rely on the plugin runtime to coordinate independent handlers, share intermediate state, and tolerate isolation boundaries (sandboxed subprocesses, distributed deployments, CLI vs REST adapters). Historically we had:

- `InvokeBroker` for cross-plugin RPC-like calls, but without standardized chain limits or trace metadata.
- `ArtifactBroker` for durable outputs, but no real-time signalling between agents.
- Ad-hoc logging / polling by plugins waiting for other agents to finish their work.

The absence of a unified orchestration layer made it difficult to build reactive chains (A → B waits for signal → C), limited our ability to reason about quotas, and forced plugin authors to re-implement coordination (temp files, busy loops, custom websockets).

We considered deferring orchestration to external systems (Redis pub/sub, NATS, bespoke workflow engines), but that adds infrastructure burden and breaks the “works out of the box” promise for CLI / single-node deployments.

## Decision

Adopt a cohesive set of runtime building blocks that ship with the plugin runtime and are safe inside the sandbox:

1. **Invoke Broker 2.0**
   - Chain limits (`depth`, `fanOut`, `maxChainTime`, `remainingMs`) enforced per execution context.
   - Automatic trace propagation (`traceId`, `spanId`, parent relationships) and analytics events (`plugin.exec.*`).
   - Permission checks against manifest `permissions.invoke`.

2. **Artifact Broker**
   - Read/write helpers with scoped base directories (`workdir`, `outdir`) and capability enforcement.
   - Auto-snapshotting on failures and rotation policies.
   - System topics (`kb.artifact.started|updated|done|error`) emitted via the Event Bus for downstream consumers.

3. **Event Bus**
   - In-memory, scoped delivery (`local`, `plugin`) with quotas (payload size, listeners, queue length, events/minute, concurrent handlers).
   - Idempotency via eventId + optional idempotencyKey with duplicate cache.
   - `emit`, `on`, `once`, `off`, `waitFor` APIs exposed inside sandbox (`runtime.events`), with AbortSignal-aware waits and timeout errors (`E_EVENT_TIMEOUT`).
   - Distributed-ready IPC bridge: subprocess runners proxy events via `process.send`, plugin scope buses use ref-counted singletons.
   - Analytics hooks (`plugin.events.emit/received/denied/dropped`) and redacted logging.

4. **Context Propagation**
   - `ExecutionContext` carries shared metadata (traceId, requestId, chain limits, extensions).
   - Sandbox serializers preserve extensions (artifacts, invoke, events) across process boundaries.
   - CLI adapter instantiates local + plugin EventBus, exposing them through `ctx.extensions.events`.

5. **Permissions and Manifest Schema**
   - `ManifestV2.permissions.events` introduces explicit allow-lists (`produce`, `consume`, `scopes`) and knobs (`maxPayloadBytes`, `dropPolicy`, `eventsPerMinute`, etc.).
   - Violations raise `E_PLUGIN_EVENT_DENIED` with remediation hints and emit analytics.

6. **Observability**
   - Unified analytics channel for invoke, artifacts, events, snapshots, and failures.
   - Metrics recorded at emission time (size, listener count, drop reason).
   - Debug (`--debug`) surfaces real-time bus traffic for CLI users.

## Consequences

### Positive

- Consistent API for coordination across all adapters (CLI, REST, future Studio).
- Reactive orchestration possible without external infrastructure; “works out of the box”.
- Sandboxed subprocesses gain first-class event support via IPC bridge.
- Clear quotas and permission errors reduce runaway chains or noisy plugins.
- Built-in analytics/tracing enables better debugging and monitoring.

### Negative

- Increased runtime complexity (duplicate caches, queues, quota tracking).
- Plugin authors must declare event permissions; misconfiguration yields denial errors.
- IPC bridge adds surface area; bugs there impact subprocess delivery.
- Additional maintenance for default configs and per-plugin singleton lifecycle.

### Alternatives Considered

- **External message brokers only (Redis/NATS)** — rejected for MVP; adds infrastructure requirements and reduces portability.
- **Polling or artifact-based signaling** — rejected; high latency, resource intensive, pushes coordination burden to plugin authors.
- **Minimal event bus without quotas** — rejected; unsafe in multi-tenant runtime (risk of unbounded memory usage or flooding).

## Implementation

- Runtime code changes:
  - `packages/runtime/src/events/**/*` — EventBus core, factory, tests.
  - `packages/runtime/src/sandbox/**/*` — IPC bridge, context serialization, runtime exposure.
  - `packages/runtime/src/adapters/cli/handler.ts` — Event bus instantiation, cleanup, analytics integration.
  - `packages/manifest/src/types.ts` — `permissions.events` schema.
- Tests cover bus behaviour, runtime exposure, quotas, and timeout errors.
- Future work (tracked separately): system scope with durable broker, workflow helpers (combinators), KV state sharing.
- Review cadence: revisit once system scope or external broker integration is introduced (target 2026-02-01).

## References

- Event Bus implementation — `packages/runtime/src/events/`
- Sandbox IPC bridge — `packages/runtime/src/sandbox/child/runtime.ts`, `node-subproc.ts`
- Manifest permission schema — `packages/manifest/src/types.ts`
- Invoke broker context — `packages/runtime/src/invoke/*`
- Artifact broker — `packages/runtime/src/artifacts/*`

---

**Last Updated:** 2025-11-08  
**Next Review:** 2026-02-01

