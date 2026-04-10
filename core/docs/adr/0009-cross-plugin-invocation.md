# ADR-0009: Cross-Plugin Agent Invocation

**Date:** 2025-01-04  
**Status:** Accepted  
**Deciders:** KB Labs Team  
**Tags:** [architecture, plugins, security]

## Context

KB Labs plugins need to collaborate and compose workflows. Currently, plugins run in isolation without the ability to invoke each other or share artifacts. This limits the system's composability and forces users to manually chain plugin executions.

We need a secure, scalable system for:
1. Plugins to invoke other plugins
2. Plugins to access artifacts from other plugins
3. Building complex workflows from simple plugin chains
4. Enforcing security and resource limits

## Decision

We implement a cross-plugin invocation system with:

### 1. Permission-Based Access Control

**Deny-by-default security model**:
- No permissions = no access
- Explicit deny always wins
- Routes must be explicitly allowed

**Granular permissions**:
- Plugin-level: Allow all routes from a plugin
- Route-level: Allow specific routes only
- Deny list: Override allow rules

**Permission priority**:
1. DENY (explicit) - Highest priority
2. Routes allow - If specified
3. Plugins allow - If specified
4. Default DENY - Lowest priority

### 2. Isolated Execution Contexts

**Each invocation runs in isolated sandbox**:
- New child process per invocation
- Separate workdir/outdir
- Isolated quotas and limits

**Chain tracking**:
- depth, fanOut, visited[] for cycle detection
- Remaining timeout budget calculation
- Quota inheritance (stricter-wins)

### 3. Version-Aware Routing

**Canonical target format**: `@pluginId@<semver>|latest:METHOD /path`

**Semver matching**:
- Registry resolves version ranges
- Error with remediation if version mismatch
- Latest version fallback

### 4. Artifact Broker

**Logical addressing**: `@pluginId/path/to/artifact.json`

**Features**:
- ACL validation before access
- Atomic writes via temp file + rename
- Metadata tracking (sha256, size, contentType)
- ContentType filtering
- FS bypass prevention

### 5. Chain Protection

**Limits**:
- maxDepth: 8 (default)
- maxFanOut: 16 (default)
- maxChainTime: Inherited from root quota

**Protection**:
- Cycle detection (visited[] tracking)
- Depth limit enforcement
- Fan-out limit enforcement
- Timeout budget calculation

### 6. Trace Propagation

**Distributed tracing**:
- traceId: Generated at root, propagated through chain
- spanId: Generated per execution/invoke
- parentSpanId: Immediate caller's spanId

**Analytics**:
- All invocations emit events with full context
- Call chain captured in analytics
- Security events for bypass attempts

## Alternatives Considered

### 1. Direct Plugin Calls (Rejected)

**Approach**: Plugins call each other directly via imports

**Why rejected**:
- No security controls
- No resource limits
- No isolation
- Hard to trace and debug

### 2. Message Queue (Deferred)

**Approach**: Use message queue for plugin communication

**Why deferred**:
- Adds complexity and infrastructure
- Async-only communication
- Harder to debug
- Can be added later if needed

### 3. RPC System (Rejected)

**Approach**: Build custom RPC system

**Why rejected**:
- Over-engineered for use case
- Harder to maintain
- Doesn't fit plugin model

### 4. HTTP Proxy (Rejected)

**Approach**: Plugins communicate via HTTP proxy

**Why rejected**:
- Network overhead
- Serialization complexity
- Harder to enforce quotas
- Doesn't fit sandbox model

## Consequences

### Positive

1. **Composability**: Plugins can build on each other
2. **Security**: Deny-by-default with granular permissions
3. **Isolation**: Each invocation isolated in sandbox
4. **Observability**: Full trace propagation and analytics
5. **Resource Control**: Quotas and limits enforced
6. **Type Safety**: TypeScript types for all APIs

### Negative

1. **Complexity**: Adds permission system and brokers
2. **Performance**: IPC overhead for subprocess mode
3. **Debugging**: Chain debugging can be complex
4. **Maintenance**: More code to maintain

### Neutral

1. **Learning Curve**: Developers need to understand permission model
2. **Migration**: Existing code may need updates

## Implementation Details

### Permission Resolution Algorithm

```typescript
function checkPermission(perms, target) {
  // 1. DENY (explicit) - highest priority
  if (deny matches target) → DENY
  
  // 2. routes allow (if specified)
  else if (routes specified && target not in routes) → DENY
  else if (routes specified && target in routes) → ALLOW
  
  // 3. plugins allow (if specified)
  else if (plugins specified && targetPlugin not in plugins) → DENY
  else if (plugins specified && targetPlugin in plugins) → ALLOW
  
  // 4. default DENY - lowest priority
  else → DENY
}
```

### Remaining Timeout Calculation

```typescript
remainingMs = min(
  caller.remainingMs - elapsed,
  target.manifest.quotas.timeoutMs,
  quotasOverride?.timeoutMs || Infinity
)
```

### Artifact Atomic Write

```typescript
// 1. Write temp
await fs.writeFile(`${path}.part`, data)

// 2. Calculate metadata
const meta = {
  owner: pluginId,
  size: data.length,
  sha256: hash(data),
  contentType: contentType || 'application/octet-stream',
  createdAt: Date.now(),
  updatedAt: Date.now()
}

// 3. Write metadata
await fs.writeFile(`${path}.meta.json`, JSON.stringify(meta))

// 4. Atomic rename
await fs.rename(`${path}.part`, path)
```

### Chain Protection

```typescript
ChainLimits {
  maxDepth: 8,        // A→B→C→...→H max
  maxFanOut: 16,      // max concurrent invokes
  maxChainTime: root.quotas.timeoutMs
}

InvokeContext {
  depth: current_depth,
  fanOut: concurrent_count,
  visited: [pluginIds],      // cycle detection
  remainingMs: calculated    // dynamic
}
```

## Security Considerations

### Deny-by-Default

- No permissions = no access
- Explicit deny always wins
- Routes must be explicitly allowed

### Isolation

- Each invocation runs in isolated sandbox
- Separate workdir/outdir per invocation
- Quotas enforced per invocation

### Artifact Protection

- Direct FS access to artifact directories blocked
- Artifacts only accessible via ArtifactBroker
- ACL validated before every access

### Chain Protection

- Depth limits prevent infinite recursion
- Fan-out limits prevent resource exhaustion
- Cycle detection prevents circular dependencies

## Performance Considerations

### IPC Overhead

In subprocess mode, brokers need IPC communication. For MVP:
- Dev mode: In-process (no IPC)
- Production: Subprocess with IPC (future work)

### Timeout Calculation

Remaining timeout calculated dynamically:
- O(1) per invocation
- Minimal overhead

### Registry Lookup

Plugin registry uses:
- Map-based lookup: O(1)
- Semver matching: O(n) where n = versions per plugin
- Typically small (n < 10)

## Future Enhancements

### 1. IPC for Subprocess Mode

Currently works in dev mode (in-process). Need:
- IPC communication for invoke/artifacts
- Registry state serialization
- Broker recreation in child process

### 2. Circuit Breaker

Add circuit breaker pattern:
- Track failure rates
- Open circuit after threshold
- Auto-recovery after timeout

### 3. Retry Logic

Add retry with backoff:
- Configurable retry count
- Exponential backoff
- Idempotency key support (already exists)

### 4. Caching

Add result caching:
- Cache by idempotencyKey
- TTL-based expiration
- Invalidation on write

### 5. Rate Limiting

Add rate limiting:
- Per-plugin rate limits
- Per-route rate limits
- Token bucket algorithm

## Migration Path

### Backward Compatibility

- All new fields optional
- Existing plugins work without changes
- New permissions opt-in

### Gradual Rollout

1. **Phase 1**: Core system (MVP) - ✅ Complete
2. **Phase 2**: IPC for subprocess mode - Future
3. **Phase 3**: Advanced features (circuit breaker, retry) - Future

### Developer Guide

1. Add invoke permissions to manifest
2. Update handlers to use `ctx.runtime.invoke()`
3. Migrate artifact access to `ctx.runtime.artifacts.read/write()`

## References

- [Cross-Plugin Invocation Documentation](./cross-plugin-invocation.md)
- [Plugin Manifest Types](../packages/plugin-manifest/src/types.ts)
- [Error Codes](../../kb-labs-api-contracts/packages/api-contracts/src/errors.ts)
- [ADR-0002: Plugins and Extensibility](./0002-plugins-and-extensibility.md)

