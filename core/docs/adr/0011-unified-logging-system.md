# ADR-0011: Unified Logging System Architecture

**Date:** 2025-01-19
**Status:** Accepted
**Deciders:** KB Labs Team
**Last Reviewed:** 2025-01-19
**Tags:** [architecture, logging, observability, production]

## Context

KB Labs ecosystem consists of multiple products (CLI, REST API, Studio, plugins) that previously used different logging implementations:
- CLI used custom `ConsoleLogger` and `FileLogger` classes
- REST API had its own `createRestLogger()` function
- Plugins used various adapter patterns (`createConsoleLogger`, etc.)
- Each product had different log formats, levels, and output destinations

This led to:
- Inconsistent log formats across products
- Difficulty in centralized log collection (Sentry, Loki, etc.)
- No unified way to configure logging across the platform
- Duplication of logging logic
- Challenges in debugging distributed workflows (traceId, spanId not consistently propagated)

## Decision

We adopt a **unified logging system** (`@kb-labs/core-sys/logging`) that provides:

1. **Single API** for all products: `getLogger(category?: string): Logger`
2. **Global state management** via `globalThis` (one instance per process)
3. **Structured logging** with consistent `LogRecord` format
4. **Multiple sinks** support (stdout, file, Sentry, Loki, etc.)
5. **Declarative configuration** via `kb.config.json`
6. **Metrics and health checks** for production observability
7. **Backpressure handling** via buffered sinks
8. **Graceful shutdown** with automatic flush

### Architecture

```
┌─────────────────────────────────────────┐
│ kb.config.json                          │
│ {                                       │
│   "logging": {                          │
│     "level": "info",                    │
│     "sinks": ["console", "file"],       │
│     "adapters": [                       │
│       { "type": "sentry", ... },        │
│       { "type": "loki", ... }           │
│     ]                                   │
│   }                                     │
│ }                                       │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│ Logging (unified system)                 │
│                                         │
│ - Global state (globalThis)             │
│ - Multiple sinks                        │
│ - Metrics & health checks               │
│ - Backpressure handling                 │
│ - Graceful shutdown                     │
└─────────────────────────────────────────┘
          ↑
┌─────────────────────────────────────────┐
│ Products (CLI, REST API, Plugins)       │
│                                         │
│ getLogger('category') → Logger          │
│   - debug/info/warn/error               │
│   - child() for context                 │
└─────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Global State via `globalThis`

**Decision:** Use `globalThis` with `Symbol.for()` for global state storage.

**Rationale:**
- Works across different bundling scenarios
- One instance per process (correct for multi-process architecture)
- No external dependencies
- Compatible with ESM and CommonJS

**Trade-off:** Each process (CLI, REST API, Studio) has its own state. This is correct - they are separate processes.

#### 2. Output vs Logging Separation

**Decision:** Separate `Output` (UI layer) from `Logging` (system layer).

**Rationale:**
- Output = formatted display for users (colors, tables, progress)
- Logging = structured records for analysis (files, Sentry, Loki)
- Output uses Logging internally (via `getLogger()`) for file writes
- Avoids duplication and circular dependencies

**Trade-off:** Two APIs to learn, but clear separation of concerns.

#### 3. Metrics Architecture: Hybrid Approach

**Decision:** Store metrics locally in memory, optionally export to analytics-sdk.

**Rationale:**
- Metrics needed for diagnosing logging system itself
- If logging is broken, how to send metrics via analytics?
- Health checks must be instant (no network delays)
- Avoids circular dependencies (logging → analytics → logging)

**Trade-off:** Metrics lost on restart, but can be exported periodically.

#### 4. Plugin Logging via `ctx.runtime.log`

**Decision:** Plugins use `ctx.runtime.log` from execution context, not direct imports.

**Rationale:**
- Ensures all plugins use same logging system
- Automatic context propagation (traceId, spanId, pluginId)
- Works in sandbox/subprocess environments
- Centralized configuration

**Trade-off:** Plugins can't create their own logger instances, but this is desired behavior.

## Consequences

### Positive

- ✅ **Unified API** - same `getLogger()` everywhere
- ✅ **Consistent format** - structured JSON logs across all products
- ✅ **Centralized configuration** - manage via `kb.config.json`
- ✅ **Production-ready** - metrics, health checks, backpressure, graceful shutdown
- ✅ **Observability** - easy integration with Sentry, Loki, Datadog
- ✅ **Distributed tracing** - traceId/spanId automatically propagated
- ✅ **Zero-config** - works out of the box with sensible defaults

### Negative

- ⚠️ **Migration effort** - all products needed updates
- ⚠️ **Learning curve** - new API to learn (but simpler than before)
- ⚠️ **Process-specific initialization** - each process must call `initLogging()`

### Alternatives Considered

1. **Keep separate logging systems**
   - Rejected: Too much duplication, inconsistent formats

2. **Use external library (Winston, Pino)**
   - Rejected: Want full control, avoid dependencies, need custom features

3. **Metrics via analytics-sdk only**
   - Rejected: Circular dependency, metrics needed for logging diagnostics

4. **Output and Logging merged**
   - Rejected: Different concerns (UI vs system), would create complexity

## Implementation

### Migration Steps

1. ✅ Created unified logging system in `@kb-labs/core-sys/logging`
2. ✅ Migrated CLI to use new system
3. ✅ Migrated REST API to use new system
4. ✅ Updated plugins to use `ctx.runtime.log`
5. ✅ Removed deprecated wrapper functions
6. ✅ Added metrics, health checks, backpressure, graceful shutdown
7. ✅ Created declarative configuration via `kb.config.json`

### Key Files

- `kb-labs-core/packages/sys/src/logging/` - Core implementation
- `kb-labs-core/packages/sys/src/logging/metrics.ts` - Metrics collection
- `kb-labs-core/packages/sys/src/logging/health.ts` - Health checks
- `kb-labs-core/packages/sys/src/logging/shutdown.ts` - Graceful shutdown
- `kb-labs-core/packages/sys/src/logging/sinks/buffered-sink.ts` - Backpressure handling
- `kb-labs-core/packages/sys/src/logging/config-loader.ts` - Declarative config

### Usage Examples

```typescript
// Basic usage
import { getLogger } from '@kb-labs/core-sys/logging';

const logger = getLogger('my-module');
logger.info('Message', { meta: 'data' });

// With context
const childLogger = logger.child({ meta: { traceId: 'abc123' } });
childLogger.debug('Debug message');

// Health check
import { checkLoggingHealth } from '@kb-labs/core-sys/logging';
const health = await checkLoggingHealth();

// Metrics
import { getMetrics } from '@kb-labs/core-sys/logging';
const metrics = getMetrics();
```

### Configuration

```json
{
  "logging": {
    "level": "info",
    "sinks": ["console", "file"],
    "adapters": [
      {
        "type": "sentry",
        "dsn": "${SENTRY_DSN}",
        "minLevel": "warn",
        "sampleRate": 0.1
      },
      {
        "type": "loki",
        "url": "${LOKI_URL}",
        "batchSize": 100,
        "flushInterval": 5000
      }
    ]
  }
}
```

## References

- [Logging Migration Plan](../../docs/logging-migration-plan.md)
- [Logging Architecture Review](../../docs/logging-architecture-review.md)
- [Metrics Architecture Decision](../../docs/logging-metrics-architecture-decision.md)
- [ADR-0005: Core Facade](./0005-core-facade.md)

---

**Last Updated:** 2025-01-XX  
**Next Review:** 2025-07-XX (6 months)

