# @kb-labs/tenant

Multi-tenancy primitives for KB Labs ecosystem.

## Overview

This package provides lightweight multi-tenancy support with:

- ✅ **Tenant Types & Quotas** - Pre-configured tiers (free, pro, enterprise)
- ✅ **Rate Limiting** - Per-tenant rate limiting using State Broker (no Redis required)
- ✅ **Zero Dependencies** - Works with in-memory State Broker out of the box
- ✅ **Backward Compatible** - Defaults to "default" tenant for single-tenant deployments
- ✅ **Scalable** - Designed to work with Redis backend when needed

## Installation

```bash
pnpm add @kb-labs/tenant
```

## Quick Start

### 1. Basic Tenant Types

```typescript
import {
  getDefaultTenantId,
  getDefaultTenantTier,
  getQuotasForTier
} from '@kb-labs/tenant';

// Get tenant from environment (defaults to "default")
const tenantId = getDefaultTenantId(); // "default" or KB_TENANT_ID
const tier = getDefaultTenantTier();   // "free" or KB_TENANT_DEFAULT_TIER

// Get quotas for tier
const quotas = getQuotasForTier('pro');
console.log(quotas);
// {
//   apiRequestsPerMinute: 1000,
//   workflowRunsPerDay: 1000,
//   concurrentWorkflows: 10,
//   storageMB: 10000,
//   retentionDays: 30
// }
```

### 2. Rate Limiting

```typescript
import { TenantRateLimiter } from '@kb-labs/tenant';
import { createStateBroker } from '@kb-labs/state-broker';

// Create rate limiter with State Broker
const broker = createStateBroker();
const limiter = new TenantRateLimiter(broker);

// Check rate limit
const result = await limiter.checkLimit('acme-corp', 'api');

if (!result.allowed) {
  console.log(`Rate limited. Retry after ${result.retryAfterMs}ms`);
  // HTTP 429 with Retry-After header
} else {
  console.log(`Allowed. Remaining: ${result.remaining}`);
  // Process request
}
```

### 3. Custom Quotas

```typescript
import { TenantRateLimiter, type TenantQuotas } from '@kb-labs/tenant';

// Define custom quotas
const customQuotas = new Map<string, TenantQuotas>();
customQuotas.set('startup-tier', {
  apiRequestsPerMinute: 500,
  workflowRunsPerDay: 200,
  concurrentWorkflows: 5,
  storageMB: 5000,
  retentionDays: 14,
});

// Create limiter with custom quotas
const limiter = new TenantRateLimiter(broker, customQuotas);

// Check with custom tier
const result = await limiter.checkLimit('startup-tenant', 'api');
```

## API Reference

### Types

#### `TenantTier`

```typescript
type TenantTier = 'free' | 'pro' | 'enterprise';
```

#### `TenantQuotas`

```typescript
interface TenantQuotas {
  /** API requests per minute */
  apiRequestsPerMinute: number;

  /** Workflow runs per day */
  workflowRunsPerDay: number;

  /** Maximum concurrent workflows */
  concurrentWorkflows: number;

  /** Storage limit in MB */
  storageMB: number;

  /** Data retention in days */
  retentionDays: number;
}
```

#### `TenantConfig`

```typescript
interface TenantConfig {
  id: string;
  tier: TenantTier;
  quotas?: TenantQuotas;
  metadata?: Record<string, unknown>;
}
```

#### `RateLimitResource`

```typescript
type RateLimitResource = 'api' | 'workflow' | 'storage';
```

#### `RateLimitResult`

```typescript
interface RateLimitResult {
  /** Whether request is allowed */
  allowed: boolean;

  /** Remaining quota in current window */
  remaining?: number;

  /** Milliseconds until quota resets */
  retryAfterMs?: number;
}
```

### Default Quotas

```typescript
import { DEFAULT_QUOTAS } from '@kb-labs/tenant';

console.log(DEFAULT_QUOTAS);
// {
//   free: {
//     apiRequestsPerMinute: 100,
//     workflowRunsPerDay: 50,
//     concurrentWorkflows: 2,
//     storageMB: 100,
//     retentionDays: 7
//   },
//   pro: {
//     apiRequestsPerMinute: 1000,
//     workflowRunsPerDay: 1000,
//     concurrentWorkflows: 10,
//     storageMB: 10000,
//     retentionDays: 30
//   },
//   enterprise: {
//     apiRequestsPerMinute: 100000,
//     workflowRunsPerDay: 100000,
//     concurrentWorkflows: 1000,
//     storageMB: 1000000,
//     retentionDays: 365
//   }
// }
```

### Helper Functions

#### `getDefaultTenantId()`

Get default tenant ID from environment variable.

```typescript
function getDefaultTenantId(): string
```

Returns: `process.env.KB_TENANT_ID ?? 'default'`

**Example:**
```bash
KB_TENANT_ID=acme-corp node app.js
```

```typescript
const tenantId = getDefaultTenantId(); // "acme-corp"
```

#### `getDefaultTenantTier()`

Get default tenant tier from environment variable.

```typescript
function getDefaultTenantTier(): TenantTier
```

Returns: `process.env.KB_TENANT_DEFAULT_TIER ?? 'free'`

**Example:**
```bash
KB_TENANT_DEFAULT_TIER=pro node app.js
```

```typescript
const tier = getDefaultTenantTier(); // "pro"
```

#### `getQuotasForTier(tier)`

Get quotas for a specific tier.

```typescript
function getQuotasForTier(tier: TenantTier): TenantQuotas
```

**Example:**
```typescript
const quotas = getQuotasForTier('enterprise');
console.log(quotas.apiRequestsPerMinute); // 100000
```

### `TenantRateLimiter`

Rate limiter using State Broker for distributed quota tracking.

#### Constructor

```typescript
constructor(
  broker: StateBroker,
  quotas?: Map<string, TenantQuotas>
)
```

**Parameters:**
- `broker` - State Broker instance (in-memory or HTTP)
- `quotas` - Optional custom quotas per tenant (defaults to DEFAULT_QUOTAS by tier)

#### Methods

##### `checkLimit(tenantId, resource)`

Check if tenant has remaining quota for resource.

```typescript
async checkLimit(
  tenantId: string,
  resource: RateLimitResource
): Promise<RateLimitResult>
```

**Parameters:**
- `tenantId` - Tenant identifier
- `resource` - Resource type ('api', 'workflow', 'storage')

**Returns:** Rate limit result with `allowed`, `remaining`, `retryAfterMs`

**Example:**
```typescript
const result = await limiter.checkLimit('acme-corp', 'api');

if (!result.allowed) {
  throw new Error(`Rate limited. Retry after ${result.retryAfterMs}ms`);
}

console.log(`Remaining quota: ${result.remaining}`);
```

##### `getQuota(tenantId)`

Get quotas for a tenant.

```typescript
getQuota(tenantId: string): TenantQuotas
```

**Parameters:**
- `tenantId` - Tenant identifier

**Returns:** Tenant quotas (custom or default for tier)

**Example:**
```typescript
const quotas = limiter.getQuota('acme-corp');
console.log(quotas.apiRequestsPerMinute); // 1000
```

##### `setQuota(tenantId, quotas)`

Set custom quotas for a tenant.

```typescript
setQuota(tenantId: string, quotas: TenantQuotas): void
```

**Parameters:**
- `tenantId` - Tenant identifier
- `quotas` - Custom quotas

**Example:**
```typescript
limiter.setQuota('vip-customer', {
  apiRequestsPerMinute: 50000,
  workflowRunsPerDay: 10000,
  concurrentWorkflows: 100,
  storageMB: 500000,
  retentionDays: 180,
});
```

## Integration Examples

### REST API Middleware

```typescript
import { TenantRateLimiter } from '@kb-labs/tenant';
import { createStateBroker } from '@kb-labs/state-broker';
import type { FastifyRequest, FastifyReply } from 'fastify';

const broker = createStateBroker();
const limiter = new TenantRateLimiter(broker);

export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // Extract tenant from header or env var
  const tenantId =
    (request.headers['x-tenant-id'] as string) ??
    process.env.KB_TENANT_ID ??
    'default';

  // Check rate limit
  const result = await limiter.checkLimit(tenantId, 'api');

  if (!result.allowed) {
    reply.code(429).header('Retry-After', String(result.retryAfterMs! / 1000));
    return { error: 'Rate limit exceeded' };
  }

  // Add tenant to request context
  request.tenantId = tenantId;
}
```

### Workflow Engine

```typescript
import { TenantRateLimiter } from '@kb-labs/tenant';
import type { WorkflowRun } from '@kb-labs/workflow-contracts';

export async function executeWorkflow(run: WorkflowRun) {
  const tenantId = run.tenantId ?? 'default';

  // Check workflow quota
  const result = await limiter.checkLimit(tenantId, 'workflow');

  if (!result.allowed) {
    throw new QuotaExceededError(
      `Tenant ${tenantId} exceeded workflow quota. Retry after ${result.retryAfterMs}ms`
    );
  }

  // Execute workflow...
}
```

### Custom Tenant Service

```typescript
import { TenantRateLimiter, type TenantConfig } from '@kb-labs/tenant';

export class TenantService {
  constructor(private limiter: TenantRateLimiter) {}

  async createTenant(config: TenantConfig): Promise<void> {
    // Set custom quotas if provided
    if (config.quotas) {
      this.limiter.setQuota(config.id, config.quotas);
    }

    // Store tenant config in database
    await db.tenants.insert(config);
  }

  async upgradeTenant(tenantId: string, newTier: TenantTier): Promise<void> {
    const quotas = getQuotasForTier(newTier);
    this.limiter.setQuota(tenantId, quotas);

    await db.tenants.update(tenantId, { tier: newTier });
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KB_TENANT_ID` | Default tenant identifier | `"default"` |
| `KB_TENANT_DEFAULT_TIER` | Default tenant tier | `"free"` |

**Example `.env` file:**
```bash
KB_TENANT_ID=my-company
KB_TENANT_DEFAULT_TIER=pro
```

## State Broker Integration

Rate limiter uses State Broker with the following key pattern:

```
ratelimit:tenant:{tenantId}:{resource}:{window}

Examples:
  ratelimit:tenant:default:api:1732896000
  ratelimit:tenant:acme-corp:workflow:1732896060
```

**TTL:** 60 seconds (automatic cleanup via State Broker)

**Backend Support:**
- ✅ **InMemoryStateBroker** - Works out of the box (single instance, 1K RPS)
- ✅ **HTTPStateBroker** - Connects to State Daemon (single instance, 1K RPS)
- 🔜 **RedisStateBroker** - Distributed quota tracking (multi-instance, 100K+ RPS)

## Error Handling

```typescript
import {
  QuotaExceededError,
  RateLimitError,
  PermissionDeniedError
} from '@kb-labs/state-broker';

try {
  const result = await limiter.checkLimit('tenant', 'api');

  if (!result.allowed) {
    throw new RateLimitError('Rate limit exceeded');
  }
} catch (error) {
  if (error instanceof RateLimitError) {
    // Return 429 with Retry-After
    reply.code(429).send({ error: error.message });
  } else if (error instanceof QuotaExceededError) {
    // Return 402 Payment Required
    reply.code(402).send({ error: 'Upgrade required' });
  }
}
```

## Performance

### In-Memory State Broker

- **Throughput:** ~1,000 requests/second
- **Latency:** <1ms
- **Memory:** ~100 bytes per active quota window
- **Use case:** Single instance deployments, development

### HTTP State Broker (Daemon)

- **Throughput:** ~1,000 requests/second
- **Latency:** ~1-2ms (local network)
- **Memory:** Shared across app instances
- **Use case:** Multi-instance deployments without Redis

### Redis State Broker (Future)

- **Throughput:** ~100,000 requests/second
- **Latency:** ~1-5ms
- **Memory:** Distributed, auto-scaling
- **Use case:** High-scale SaaS, multi-region

## Best Practices

### 1. Use HTTP State Daemon for Multi-Instance Deployments

```bash
# Start State Daemon
kb-state-daemon

# Configure apps to use HTTP backend
KB_STATE_BROKER_URL=http://localhost:7777 node app.js
```

### 2. Set Custom Quotas for Special Tenants

```typescript
// VIP customer with higher limits
limiter.setQuota('vip-tenant', {
  apiRequestsPerMinute: 10000,
  workflowRunsPerDay: 5000,
  concurrentWorkflows: 50,
  storageMB: 100000,
  retentionDays: 90,
});
```

### 3. Return Proper HTTP Status Codes

```typescript
const result = await limiter.checkLimit(tenantId, 'api');

if (!result.allowed) {
  // 429 Too Many Requests
  reply.code(429)
    .header('Retry-After', String(result.retryAfterMs! / 1000))
    .send({ error: 'Rate limit exceeded' });
}
```

### 4. Log Tenant Context

```typescript
// Add tenant fields through child logger context
const tenantLogger = logger.child({ tenantId, tier });

tenantLogger.info('Processing request');
// Logs: { tenantId: "acme-corp", tier: "pro", message: "Processing request" }
```

### 5. Monitor Tenant Metrics

Prometheus metrics are automatically tracked with tenant labels:

```prometheus
kb_tenant_request_total{tenant="default"} 1234
kb_tenant_request_errors_total{tenant="acme-corp"} 5
kb_tenant_request_duration_ms_avg{tenant="vip-tenant"} 23.4
```

Query with PromQL:
```promql
# Requests per tenant
sum by (tenant) (rate(kb_tenant_request_total[5m]))

# Error rate per tenant
sum by (tenant) (rate(kb_tenant_request_errors_total[5m]))
  / sum by (tenant) (rate(kb_tenant_request_total[5m]))
```

## Migration from Single-Tenant

Existing single-tenant deployments work without changes:

```typescript
// Old code (no tenant)
const result = await broker.get('mind:query-123');

// New code (backward compatible)
const result = await broker.get('mind:query-123'); // ← Still works!
// Internally treated as: tenant:default:mind:query-123
```

To enable multi-tenancy:

1. **Set environment variable:**
   ```bash
   KB_TENANT_ID=my-tenant
   ```

2. **Or use new key format:**
   ```typescript
   await broker.set('tenant:acme:mind:query-123', data);
   ```

3. **Or send header:**
   ```bash
   curl -H "X-Tenant-ID: acme-corp" https://api.example.com/workflows
   ```

## License

MIT

## Related Documentation

- [ADR-0015: Multi-Tenancy Primitives](../../../kb-labs-workflow/docs/adr/0015-multi-tenancy-primitives.md)
- [State Broker README](../state-broker/README.md)
- [State Daemon README](../state-daemon/README.md)
- [Workflow Contracts](../../../kb-labs-workflow/packages/workflow-contracts/)

## Support

- Issues: [GitHub Issues](https://github.com/kb-labs/kb-labs/issues)
- Discussions: [GitHub Discussions](https://github.com/kb-labs/kb-labs/discussions)
