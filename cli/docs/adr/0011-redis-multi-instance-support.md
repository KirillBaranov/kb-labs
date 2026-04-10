# ADR-0011: Redis Support for Multi-Instance Deployments

**Status:** Proposed
**Date:** 2025-11-04
**Authors:** KB Labs Team
**Supersedes:** None
**Related:** ADR-0010 (CLI API Refactoring)
**Tags:** `redis`, `cache`, `scalability`, `multi-instance`, `kubernetes`, `infrastructure`

## Context

The REST API uses `@kb-labs/cli-api` with in-memory cache and local event subscriptions. This works perfectly for single-instance deployments (development, small production). However, when horizontally scaling the REST API (multiple instances behind a load balancer or Kubernetes HPA), we face synchronization challenges:

### Problems with Multi-Instance Without Redis

1. **Cache Inconsistency**
   - Each instance has its own in-memory cache
   - Plugin discovery happens independently on each instance
   - Cache misses cause duplicate discovery operations
   - No guarantee of consistent data across instances

2. **Event Propagation**
   - `onChange` callbacks are local to each instance
   - File changes (watch mode) detected independently by each instance
   - No way to notify other instances about registry changes
   - Potential for stale data when plugins are updated

3. **Resource Waste**
   - Multiple file watchers monitoring the same directories
   - Duplicate discovery operations
   - Higher memory footprint per instance

### Current Architecture (Single Instance)

```
┌─────────────────────────────────────┐
│         REST API Instance           │
│                                     │
│  ┌──────────────────────────────┐  │
│  │       CliAPI Singleton       │  │
│  │                              │  │
│  │  ┌────────────────────────┐ │  │
│  │  │  InMemoryCacheAdapter  │ │  │
│  │  └────────────────────────┘ │  │
│  │                              │  │
│  │  ┌────────────────────────┐ │  │
│  │  │  Local onChange events │ │  │
│  │  └────────────────────────┘ │  │
│  │                              │  │
│  │  ┌────────────────────────┐ │  │
│  │  │  Chokidar watch mode   │ │  │
│  │  └────────────────────────┘ │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

### Desired Architecture (Multi-Instance with Redis)

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ REST API Inst 1  │  │ REST API Inst 2  │  │ REST API Inst 3  │
│                  │  │                  │  │                  │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │    CliAPI    │ │  │ │    CliAPI    │ │  │ │    CliAPI    │ │
│ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                     │                     │
         └─────────────────────┼─────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │       Redis         │
                    │                     │
                    │  ┌───────────────┐  │
                    │  │  Cache Store  │  │
                    │  │  (shared)     │  │
                    │  └───────────────┘  │
                    │                     │
                    │  ┌───────────────┐  │
                    │  │   PubSub      │  │
                    │  │   (events)    │  │
                    │  └───────────────┘  │
                    └─────────────────────┘
```

## Decision

We will add **optional** Redis support for multi-instance deployments while keeping in-memory mode as the default for single-instance scenarios.

### Key Principles

1. **Opt-in, not mandatory**: Redis is only required for multi-instance deployments
2. **Zero config by default**: No Redis = works out of the box
3. **Graceful degradation**: If Redis fails, fall back to in-memory mode
4. **No code changes**: Just set `REDIS_URL` environment variable

### Implementation Strategy

#### 1. Cache Adapter Pattern (Already Exists)

```typescript
// cli-core/src/cache/cache-adapter.ts
export interface CacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// cli-core/src/cache/in-memory-adapter.ts (existing)
export class InMemoryCacheAdapter implements CacheAdapter {
  // ... in-memory Map-based implementation
}

// cli-core/src/cache/redis-adapter.ts (NEW)
export class RedisCacheAdapter implements CacheAdapter {
  private client: RedisClientType;
  
  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl });
  }
  
  async connect(): Promise<void> {
    await this.client.connect();
  }
  
  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlMs) {
      await this.client.setEx(key, Math.floor(ttlMs / 1000), serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }
  
  // ... delete, clear, disconnect
}
```

#### 2. Event Bus Pattern (NEW)

```typescript
// cli-core/src/registry/event-bus.ts (NEW)
export interface EventBus {
  publish(event: 'registry:changed', diff: RegistryDiff): Promise<void>;
  subscribe(event: 'registry:changed', handler: (diff: RegistryDiff) => void): () => void;
  disconnect(): Promise<void>;
}

export class InMemoryEventBus implements EventBus {
  // Local event handling (current behavior)
}

export class RedisEventBus implements EventBus {
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  
  constructor(redisUrl: string) {
    this.publisher = createClient({ url: redisUrl });
    this.subscriber = createClient({ url: redisUrl });
  }
  
  async connect(): Promise<void> {
    await this.publisher.connect();
    await this.subscriber.connect();
    
    await this.subscriber.pSubscribe('registry:*', (message, channel) => {
      const handlers = this.handlers.get(channel);
      if (handlers) {
        const data = JSON.parse(message);
        handlers.forEach(h => h(data));
      }
    });
  }
  
  async publish(event: 'registry:changed', diff: RegistryDiff): Promise<void> {
    await this.publisher.publish(event, JSON.stringify(diff));
  }
  
  // ... subscribe, disconnect
}
```

#### 3. Bootstrap Integration (REST API)

```typescript
// rest-api/src/bootstrap.ts
export async function bootstrap(cwd: string = process.cwd()): Promise<void> {
  const repoRoot = await findMonorepoRoot(cwd);
  
  let cacheAdapter: CacheAdapter | undefined;
  let eventBus: EventBus | undefined;
  
  // Auto-detect Redis from environment
  if (process.env.REDIS_URL) {
    console.log('[Bootstrap] Using Redis for distributed cache and events');
    
    try {
      const redisCache = new RedisCacheAdapter(process.env.REDIS_URL);
      await redisCache.connect();
      cacheAdapter = redisCache;
      
      const redisEvents = new RedisEventBus(process.env.REDIS_URL);
      await redisEvents.connect();
      eventBus = redisEvents;
    } catch (error) {
      console.warn('[Bootstrap] Redis connection failed, falling back to in-memory:', error);
      // cacheAdapter remains undefined = default to in-memory
    }
  } else {
    console.log('[Bootstrap] Using in-memory cache (single instance mode)');
  }
  
  const cliApi = await createCliAPI({
    discovery: {
      strategies: ['workspace', 'pkg', 'dir', 'file'],
      roots: [repoRoot],
      watch: !process.env.REDIS_URL, // Only watch in single-instance
    },
    cache: {
      adapter: cacheAdapter, // undefined = default InMemoryCacheAdapter
      ttlMs: 30_000,
    },
    eventBus, // undefined = default InMemoryEventBus
    logger: {
      level: 'info',
    },
  });
  
  // ... rest of bootstrap
}
```

### Configuration

#### Single Instance (Default)

```bash
# No environment variables needed
npm start

# Result:
# - In-memory cache
# - Local events only
# - File watch mode enabled
# - 0 dependencies
```

#### Multi-Instance (Kubernetes)

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rest-api
spec:
  replicas: 3  # Multiple instances
  template:
    spec:
      containers:
      - name: rest-api
        image: kb-labs-rest-api:latest
        env:
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        ports:
        - containerPort: 3000
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
        livenessProbe:
          httpGet:
            path: /health
            port: 3000

---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
spec:
  selector:
    app: redis
  ports:
  - port: 6379
```

```bash
# Result:
# - Redis shared cache (all instances see same data)
# - Redis PubSub (events propagate across instances)
# - File watch mode disabled (only primary refreshes)
# - Horizontal scaling ready
```

## Consequences

### Positive

1. **Zero Breaking Changes**
   - Existing single-instance deployments continue working
   - No code changes required in plugins
   - Redis is opt-in

2. **Production-Ready Scaling**
   - Kubernetes HPA works out of the box
   - Load balancers don't cause cache inconsistency
   - Events propagate across all instances

3. **Graceful Degradation**
   - Redis failure doesn't crash the system
   - Falls back to in-memory mode
   - Logs clear warnings

4. **Performance Benefits**
   - Shared cache reduces duplicate discovery
   - Only one instance watches file changes
   - Lower memory per instance

5. **Developer Experience**
   - Simple: just add `REDIS_URL` env var
   - Same codebase for dev and prod
   - Easy to test locally with Docker

### Negative

1. **New Dependency**
   - Redis required for multi-instance
   - Infrastructure complexity increases
   - Need to manage Redis availability

2. **Operational Overhead**
   - Redis monitoring required
   - Backups (if needed)
   - Network latency between REST API and Redis

3. **Potential Failure Point**
   - Redis downtime = degraded mode
   - Network issues between services
   - Need Redis clustering for HA

4. **Development Setup**
   - Developers need Redis for multi-instance testing
   - Docker Compose or local Redis required

### Mitigation Strategies

1. **Graceful Degradation**
   ```typescript
   try {
     await redisCache.connect();
   } catch (error) {
     console.warn('Redis unavailable, using in-memory cache');
     // Continue with InMemoryCacheAdapter
   }
   ```

2. **Health Checks**
   ```typescript
   fastify.get('/ready', async (_, reply) => {
     const redisHealthy = await checkRedisConnection();
     if (!redisHealthy && process.env.REDIS_URL) {
       reply.code(503).send({ ready: false, reason: 'Redis unavailable' });
       return;
     }
     reply.send({ ready: true });
   });
   ```

3. **Circuit Breaker (Future)**
   - Detect Redis failures
   - Auto-fallback to in-memory
   - Retry with exponential backoff

## Alternatives Considered

### Alternative 1: Always Use Redis

**Rejected**: Too heavy for small deployments. Most users don't need multi-instance.

### Alternative 2: Database-backed Cache (PostgreSQL)

**Rejected**: 
- Higher latency than Redis
- PubSub not as efficient
- Overkill for cache use case

### Alternative 3: HTTP-based Event Broadcasting

**Rejected**:
- Requires all instances to know each other
- Complex in Kubernetes (service discovery)
- Not as reliable as Redis PubSub

### Alternative 4: Sticky Sessions (Load Balancer)

**Rejected**:
- Doesn't solve cache consistency
- User bound to one instance
- Defeats purpose of horizontal scaling

## Performance Impact

### Single Instance (No Redis)

| Metric | Value |
|--------|-------|
| Cold start | ~50ms |
| /openapi.json | ~15ms |
| explain() | ~0.5ms |
| snapshot() | ~0.1ms |
| Memory | ~50MB |

### Multi-Instance (With Redis) - Per Instance

| Metric | Value | Notes |
|--------|-------|-------|
| Cold start | ~70ms | +20ms Redis connection |
| /openapi.json (cache hit) | ~2ms | Redis roundtrip |
| /openapi.json (cache miss) | ~20ms | +5ms Redis write |
| explain() | ~0.5ms | Local (no Redis) |
| snapshot() | ~0.1ms | Local (no Redis) |
| Memory | ~40MB | -10MB (shared cache) |

**Throughput (3 instances with Redis):**
- **Before:** 300 req/s (100 req/s × 3, duplicate work)
- **After:** 900 req/s (300 req/s × 3, shared cache)

## Migration Path

### Phase 1: Add Redis Support (Current)

- Implement `RedisCacheAdapter`
- Implement `RedisEventBus`
- Update bootstrap for optional Redis
- Add documentation

### Phase 2: Production Validation

- Deploy to staging with Redis
- Monitor performance metrics
- Validate event propagation
- Test Redis failure scenarios

### Phase 3: Rollout

- Small prod deployments (1-2 instances)
- Monitor for issues
- Scale to 3-5 instances
- Measure performance gains

### Phase 4: Optimization (Future)

- Add circuit breaker
- Implement Redis connection pooling
- Add Redis Sentinel support
- Metrics and tracing integration

## Documentation

### User-Facing Documentation

1. **README.md** - Quick start with and without Redis
2. **deployment-guide.md** - Kubernetes examples
3. **troubleshooting.md** - Redis connection issues

### Developer Documentation

1. **cache-adapter.md** - How to implement custom adapters
2. **event-bus.md** - Event system architecture
3. **testing-guide.md** - Local Redis testing with Docker

## References

- ADR-0010: CLI API Refactoring
- [Redis PubSub Documentation](https://redis.io/docs/manual/pubsub/)
- [Kubernetes Horizontal Pod Autoscaler](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [12-Factor App: Backing Services](https://12factor.net/backing-services)

## Appendix: Example Deployment

### Docker Compose (Development)

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  rest-api-1:
    build: .
    ports:
      - "3001:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      redis:
        condition: service_healthy

  rest-api-2:
    build: .
    ports:
      - "3002:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      redis:
        condition: service_healthy

  rest-api-3:
    build: .
    ports:
      - "3003:3000"
    environment:
      - REDIS_URL=redis://redis:6379
      - PORT=3000
    depends_on:
      redis:
        condition: service_healthy
```

### Testing Multi-Instance Locally

```bash
# Start all services
docker-compose up -d

# Test load balancing
for i in {1..10}; do
  curl -s http://localhost:300$((RANDOM % 3 + 1))/health | jq '.registry'
done

# All instances should show same registry version and plugin count

# Test event propagation
# 1. Add a new plugin in workspace
# 2. Wait 30s (TTL expiration)
# 3. All instances automatically refresh via Redis PubSub
```

## Decision Date

2025-11-04

## Status Updates

- **2025-11-04**: Proposed
- **Future**: Accepted after validation

