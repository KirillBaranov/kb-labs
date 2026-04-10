# ADR-0011: Permission and Quota Framework in Plugin Runtime

**Date:** 2025-11-08  
**Status:** Accepted  
**Deciders:** KB Labs Team  
**Last Reviewed:** 2025-11-08  
**Tags:** [architecture, security, runtime]

## Context

Plugins execute user-provided code and need controlled access to host capabilities (filesystem, network, env vars, invoke, events, artifacts). Early versions used implicit allow-lists (e.g., full FS access) and ad hoc checks inside handlers, which led to:

- Inconsistent enforcement across adapters (CLI vs REST).
- Difficult auditing of what a plugin is allowed to do.
- No quotas (timeouts, memory, rate limits), increasing risk for chained invokes.

The manifest v2 already has `permissions` structure but required uniform interpretation and integration with runtime tooling.

## Decision

Standardize permissions and quotas across the runtime, enforced at execution time and logged for observability:

1. **Manifest Schema (`ManifestV2.permissions`)**
   - `fs`: mode (`none`, `read`, `readWrite`), allow/deny glob patterns.
   - `net`: allowed hosts/CIDRs, optional deny list, timeout, or `'none'`.
   - `env`: allow list for environment variables (supports wildcards).
   - `quotas`: execution timeout, memory, CPU budget (ms).
   - `capabilities`: extensible list for feature flags (e.g., `kv.read`).
   - `invoke`: allow list of plugins/routes with overrides.
   - `artifacts`: read/write policies per plugin/path.
   - `events`: produce/consume allow lists, scopes, schema references, limits (payload size, queue, rate, concurrent handlers).

2. **Runtime Enforcement**
   - CLI/REST adapters compute effective permissions before invoking runtime.
   - Resource limits (`timeoutMs`, `memoryMb`) passed into sandbox config.
   - Event bus guard uses `permissions.events` (deny-by-default).
   - `checkFsPermission`, `checkNetPermission`, `checkEnvPermission`, `checkAllPermissions` utilities exported for host usage and preflight validation.
   - Invoke broker enforces `permissions.invoke` per call.

3. **Observability & Analytics**
   - Every denial emits `plugin.events.denied` / `plugin.permission.denied` with remediation.
   - Error envelopes include sanitized permission summaries (`PermissionSpecSummary`) for diagnostics.
   - Analytics events generated on capability violations (`plugin.permission.denied`, `plugin.permission.granted`).

4. **Developer Experience**
   - Default policy is deny-by-default; CLI prompts call out missing entries in manifest.
   - CLI debug logs show resolved permissions and quotas.
   - Tests assert permission failures produce actionable errors.

## Consequences

### Positive

- Uniform enforcement across all adapters and execution modes.
- Plugins declare intent declaratively; easier auditing and review.
- Runtime can provide actionable errors and analytics for security monitoring.
- Basis for future auto-generation of security manifests or approval workflows.

### Negative

- Authors must configure permissions explicitly (steeper onboarding).
- Misconfiguration leads to runtime denials; requires documentation/examples.
- Additional code paths to maintain (guards in invoke, event bus, FS/NET shims).

### Alternatives Considered

- **Allow all by default, warn** — rejected; too risky for multi-tenant runtime.
- **External policy engine (OPA)** — rejected for MVP due to complexity and deployment overhead.
- **Capability-only model (no detailed allow lists)** — insufficient for FS/NET granularity.

## Implementation

- Schema: `packages/manifest/src/types.ts` (`PermissionSpec`, `ManifestV2.permissions`).
- Runtime checks: `packages/runtime/src/permissions.ts`, `io/fs.ts`, `io/net.ts`, `io/env.ts`.
- Event bus guard: `packages/runtime/src/events/event-bus.ts`.
- Invoke broker: `packages/runtime/src/invoke/broker.ts`.
- Error envelopes: `packages/runtime/src/types.ts` (PermissionSpecSummary).
- CLI integration: `packages/adapters/cli/src/handler.ts` (config resolution, debug logs).
- Future: tool-assisted manifest generation + static analysis (target review 2026-04-01).

## References

- Manifest schema — `packages/manifest/src/types.ts`
- Permission utilities — `packages/runtime/src/permissions.ts`
- Event bus guard — `packages/runtime/src/events/event-bus.ts`
- Invoke checks — `packages/runtime/src/invoke/broker.ts`
- CLI wiring — `packages/adapters/cli/src/handler.ts`

---

**Last Updated:** 2025-11-08  
**Next Review:** 2026-04-01

