# ADR-0010: Sandbox Execution Model and Isolation Policies

**Date:** 2025-11-08  
**Status:** Accepted  
**Deciders:** KB Labs Team  
**Last Reviewed:** 2025-11-08  
**Tags:** [architecture, runtime, sandbox]

## Context

Plugins must run untrusted code while protecting the host process, enforcing resource limits, and still enabling rich debugging. Early prototypes executed handlers in-process with manual try/catch, which allowed:

- Plugins mutating global state (e.g., patching `process.env`).
- Unbounded execution time or memory usage.
- No boundary between CLI adapters and handlers (errors bubbled to host).

We needed a unified sandbox that works for CLI, REST, and future Studio adapters, supports multi-platform development, and can fall back to in-process mode for dev ergonomics (hot reload, debugging).

Key requirements:

- Hard isolation for production (`subprocess`), with IPC for logs, events, artifacts.
- Dev-friendly mode (`inprocess`) that preserves Node inspector, console debugging.
- Deterministic lifecycle: start, run, enforce timeout, drain, dispose.
- Extension points (invoke, artifacts, events) must survive context serialization.

## Decision

Adopt a dual-mode sandbox runner implemented in `@kb-labs/sandbox` and integrated with `@kb-labs/plugin-runtime`:

1. **Subprocess Runner (default production mode)**
   - Forks Node child process with controlled `execArgv` (`--max-old-space-size`, `--enable-source-maps`).
   - Enforces execution policy via `startTimeoutWatch` (timeout + grace SIGTERM + SIGKILL).
   - Serializes `ExecutionContext` through `ipc-serializer` (drops functions, keeps metadata).
   - Bridges runtime extensions over IPC (artifacts, invoke, events) using custom message types (`EVENT_EMIT`, `EVENT_SUBSCRIBE`, etc.).
   - Collects stdout/stderr + IPC LOG messages into ring buffers for error reporting, respecting `ctx.debug`.

2. **In-Process Runner (dev mode)**
   - Activated by manifest config (`mode: inprocess`) or `KB_PLUGIN_DEV_MODE`.
  - Keeps direct require/import for hot reload; wraps `console` to capture logs.
   - Shares same runtime extensions but skips IPC path.

3. **Resource Tracking & Cleanup**
   - Every context carries `ResourceTracker`; subprocess reports `tmpFiles`.
   - `shutdown()` drains queues (events) with configurable timeout.

4. **Debugging Support**
   - Inspect mode (`--debug=inspect`) reserves free port (>=9229), prints guidance to CLI output.
   - Profile mode (`--debug=profile`) collects profiler data + exports to Chrome format.

5. **Integration**
   - CLI adapter selects runner via `createRunnerConfig`.
   - REST adapter defaults to subprocess but can switch for local dev.
   - Tests cover both modes (`packages/runtime/src/sandbox/*`).

## Consequences

### Positive

- Clear separation between host and plugin; faults no longer crash CLI/REST.
- Same sandbox implementation shared across all products and adapters.
- Devs can choose dev-friendly mode without sacrificing production safety.
- IPC bridge enables additional capabilities (event bus, invoke) without rewriting for subprocess.

### Negative

- Additional complexity in runtime (serialization, message handling, ref counting).
- Slight overhead for subprocess spin-up; cold start slower than pure in-process.
- IPC bugs can affect delivery of logs/events (need monitoring).

### Alternatives Considered

- **Worker Threads** — rejected due to shared memory and limited isolation.
- **VM modules (Node vm)** — rejected: still share same process / less protection.
- **External sandbox (Docker/Firecracker)** — too heavy for CLI/dev workflows.

## Implementation

- Core sandbox logic: `kb-labs-core/packages/sandbox/src/**/*`.
- Runtime integration: `packages/runtime/src/sandbox/*`, `node-subproc.ts`.
- CLI linkage: `packages/adapters/cli/src/handler.ts`.
- Debug/inspect support with CLI flags.
- Future revisit: evaluate Worker Threads once Node isolation matures (target review 2026-03-01).

## References

- Sandbox serializer — `packages/sandbox/src/runner/ipc-serializer.ts`
- Subprocess runner — `packages/sandbox/src/runner/subprocess-runner.ts`
- Runtime bridge — `packages/runtime/src/sandbox/node-subproc.ts`
- CLI adapter config — `packages/adapters/cli/src/handler.ts`

---

**Last Updated:** 2025-11-08  
**Next Review:** 2026-03-01

