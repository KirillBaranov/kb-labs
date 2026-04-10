# ADR-0023: Runtime Adapter Pattern for Sandbox Compatibility

**Date:** 2025-11-18
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-11-18
**Tags:** [architecture, sandbox, abstraction]

## Context

Mind v2 needs to work in different execution environments:

- **CLI**: Full Node.js environment with file system and network access
- **Sandbox**: Restricted environment with limited APIs (KB Labs plugin sandbox)
- **Testing**: Mocked environment for unit tests

We need an abstraction that allows Mind v2 to work across these environments without code changes.

## Decision

We will implement a **Runtime Adapter pattern** that abstracts environment-specific APIs:

1. **RuntimeAdapter Interface**: Common interface for all environments
2. **CLI Implementation**: Full Node.js implementation
3. **Sandbox Implementation**: Sandbox-compatible implementation
4. **Factory Function**: Creates appropriate adapter based on context

### Architecture

```typescript
export interface RuntimeAdapter {
  fetch: (input: string | { url: string } | { href: string }, init?: FetchInit) => Promise<FetchResponse>;
  fs: FileSystemAdapter;
  env: (key: string) => string | undefined;
  log?: (level: 'debug' | 'info' | 'warn' | 'error', msg: string, meta?: Record<string, unknown>) => void;
  analytics?: AnalyticsAdapter;
}

export function createRuntimeAdapter(options?: Partial<RuntimeAdapter>): RuntimeAdapter {
  // Use provided options or create defaults
  return {
    fetch: options?.fetch ?? defaultFetch,
    fs: options?.fs ?? defaultFS,
    env: options?.env ?? defaultEnv,
    log: options?.log,
    analytics: options?.analytics,
  };
}
```

### Adapter Implementations

1. **CLI Runtime Adapter**
   - Uses Node.js `fetch` or `node-fetch`
   - Uses `fs-extra` for file system
   - Uses `process.env` for environment variables
   - Full logging and analytics

2. **Sandbox Runtime Adapter**
   - Uses sandbox-provided `fetch` API
   - Uses sandbox file system API
   - Uses sandbox environment API
   - Restricted logging and analytics

3. **Test Runtime Adapter**
   - Mocked implementations
   - In-memory file system
   - Configurable environment variables
   - Captured logs for assertions

## Rationale

### Why Adapter Pattern?

- **Environment Abstraction**: Works in different environments
- **Testability**: Easy to mock for tests
- **Sandbox Compatibility**: Works in restricted environments
- **Flexibility**: Can swap implementations

### Why Not Direct APIs?

- **Sandbox Restrictions**: Can't use Node.js APIs directly
- **Testing**: Hard to mock global APIs
- **Portability**: Works across different environments
- **Consistency**: Same interface everywhere

### Why Factory Function?

- **Automatic Detection**: Can detect environment
- **Configuration**: Can override defaults
- **Flexibility**: Easy to customize
- **Simplicity**: Single entry point

## Consequences

### Positive

- **Portability**: Works in CLI and sandbox
- **Testability**: Easy to mock and test
- **Flexibility**: Can customize for different environments
- **Consistency**: Same interface everywhere

### Negative

- **Abstraction Overhead**: Additional layer of indirection
- **Interface Limitations**: May not expose all features
- **Complexity**: More code to maintain

### Mitigation Strategies

- **Minimal Interface**: Keep interface focused
- **Extensibility**: Can extend with environment-specific features
- **Clear Documentation**: Document adapter capabilities
- **Type Safety**: Strong typing prevents misuse

## Implementation

### Usage in Mind Engine

```typescript
export class MindKnowledgeEngine {
  private readonly runtime: RuntimeAdapter;
  
  constructor(config: KnowledgeEngineConfig, context: KnowledgeEngineFactoryContext) {
    // Extract runtime from options or create default
    const runtimeInput = config.options?._runtime;
    this.runtime = runtimeInput && 'fetch' in runtimeInput
      ? runtimeInput as RuntimeAdapter
      : createRuntimeAdapter(runtimeInput);
    
    // Use runtime for all environment access
    const qdrantUrl = this.runtime.env.get('QDRANT_URL');
    const response = await this.runtime.fetch(qdrantUrl);
  }
}
```

### Sandbox Integration

```typescript
// In sandbox environment
const sandboxRuntime: RuntimeAdapter = {
  fetch: sandbox.fetch,  // Sandbox-provided fetch
  fs: sandbox.fs,        // Sandbox file system
  env: sandbox.env,      // Sandbox environment
  log: sandbox.log,      // Sandbox logging
};

const engine = new MindKnowledgeEngine(config, {
  ...context,
  runtime: sandboxRuntime,
});
```

## Testing Strategy

- Unit tests with mocked runtime
- Integration tests with real runtime
- Sandbox compatibility tests
- Test adapter factory function

## Future Enhancements

- Browser runtime adapter
- Edge runtime adapter
- More sophisticated environment detection
- Runtime capability detection

## Alternatives Considered

### Direct Node.js APIs

- **Pros**: Simpler, no abstraction
- **Cons**: Doesn't work in sandbox, hard to test
- **Decision**: Rejected - need sandbox compatibility

### Environment-Specific Code

- **Pros**: Can use all features of each environment
- **Cons**: Code duplication, maintenance burden
- **Decision**: Rejected - want single codebase

### Plugin System

- **Pros**: Maximum flexibility
- **Cons**: Over-engineering for current needs
- **Decision**: Rejected - adapter pattern is sufficient

## References

- [KB Labs Sandbox Documentation](../../kb-labs-core/docs/sandbox.md)
- [Adapter Pattern](https://en.wikipedia.org/wiki/Adapter_pattern)

---

**Last Updated:** 2025-11-18  
**Next Review:** 2026-02-18 (quarterly review)

