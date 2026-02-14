# KB Labs Architecture Deep Dive

> **Complete architectural breakdown of KB Labs platform**
> **Last Updated:** 2026-01-12

This document provides a comprehensive deep dive into KB Labs architecture, design patterns, and implementation details. Perfect for understanding how the platform works under the hood.

## Table of Contents

- [System Overview](#system-overview)
- [Adapter-First Architecture](#adapter-first-architecture)
- [Execution Layer](#execution-layer)
- [Plugin System](#plugin-system)
- [Workflow Engine](#workflow-engine)
- [Multi-Tenancy & Quotas](#multi-tenancy--quotas)
- [Observability & Monitoring](#observability--monitoring)
- [Data Flow Examples](#data-flow-examples)
- [Performance Characteristics](#performance-characteristics)
- [Design Trade-Offs](#design-trade-offs)

---

## System Overview

KB Labs is an **adapter-first Internal Developer Platform** built on three core principles:

1. **Zero vendor lock-in** — Every infrastructure component is swappable via config
2. **Progressive complexity** — Start simple ($0), scale to enterprise ($1K+) without rewrites
3. **Platform handles infrastructure** — Plugin authors write business logic, platform provides everything else

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interfaces                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   CLI    │  │ REST API │  │ Webhooks │  │ Studio UI│       │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └─────┬────┘       │
└────────┼─────────────┼─────────────┼─────────────┼─────────────┘
         │             │             │             │
         └─────────────┴─────────────┴─────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │        Core Platform              │
         │  ┌─────────────────────────────┐  │
         │  │   Plugin System             │  │
         │  │   - Discovery               │  │
         │  │   - Validation              │  │
         │  │   - Execution               │  │
         │  │   - Permissions             │  │
         │  └─────────────────────────────┘  │
         │  ┌─────────────────────────────┐  │
         │  │   Workflow Engine           │  │
         │  │   - Priority Queue          │  │
         │  │   - Dependency Resolution   │  │
         │  │   - State Management        │  │
         │  └─────────────────────────────┘  │
         │  ┌─────────────────────────────┐  │
         │  │   Multi-Tenancy             │  │
         │  │   - Tenant Isolation        │  │
         │  │   - Quotas & Rate Limiting  │  │
         │  │   - Usage Tracking          │  │
         │  └─────────────────────────────┘  │
         └───────────────┬───────────────────┘
                         │
         ┌───────────────┴───────────────────┐
         │    Infrastructure Adapters        │
         │  ┌──────┐ ┌──────┐ ┌──────┐      │
         │  │Cache │ │  DB  │ │Logger│      │
         │  └──────┘ └──────┘ └──────┘      │
         │  ┌──────┐ ┌──────┐ ┌──────┐      │
         │  │ LLM  │ │Vector│ │Metrics│     │
         │  └──────┘ └──────┘ └──────┘      │
         └───────────────────────────────────┘
                         │
         ┌───────────────┴───────────────────┐
         │    Execution Backends             │
         │  ┌──────────┐  ┌──────────┐      │
         │  │InProcess │  │Subprocess│      │
         │  └──────────┘  └──────────┘      │
         │  ┌──────────┐  ┌──────────┐      │
         │  │WorkerPool│  │  Remote  │      │
         │  └──────────┘  └──────────┘      │
         └───────────────────────────────────┘
```

### Key Statistics

- **Scale:** ~80 packages across 18 repositories
- **Type Coverage:** 93.9% across monorepo (2,041 type errors tracked)
- **Documentation:** 265+ Architecture Decision Records
- **DevKit Tools:** 18 monorepo management tools
- **Products:** 25 documented products (23 MVP 1.0, 2 planned)

---

## Adapter-First Architecture

**Core Principle:** Every infrastructure dependency is defined as an interface, implementations are injected at runtime via config.

### The Problem This Solves

Traditional platforms hard-code infrastructure choices:

```typescript
// ❌ Traditional approach - vendor lock-in
import { RedisClient } from 'redis';

class UserService {
  private cache = new RedisClient({ url: 'redis://localhost' });

  async getUser(id: string) {
    const cached = await this.cache.get(`user:${id}`);
    if (cached) return JSON.parse(cached);
    // ... fetch from DB
  }
}
```

**Problems:**
- Can't switch from Redis → Memcached without code changes
- Can't use InMemory cache for local dev
- Can't swap to AWS ElastiCache for production
- Testing requires Redis running

### KB Labs Adapter Solution

```typescript
// ✅ KB Labs approach - zero vendor lock-in
import { ICache } from '@kb-labs/core-platform';

class UserService {
  constructor(private cache: ICache) {}  // Injected by platform

  async getUser(id: string) {
    const cached = await this.cache.get(`user:${id}`);
    if (cached) return JSON.parse(cached);
    // ... fetch from DB
  }
}
```

**Benefits:**
- Swap Redis → Memcached → InMemory in config file
- Use InMemory for tests, Redis for staging, ElastiCache for production
- Same codebase scales from $0 → $1K+/month
- Test without external dependencies

### Adapter Interface Example

```typescript
// packages/core-platform/src/adapters/cache.ts
export interface ICache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

// Implementations (swappable):
// - @kb-labs/adapters-memory    → InMemoryCache
// - @kb-labs/adapters-redis     → RedisCache
// - @kb-labs/adapters-memcached → MemcachedCache
// - @kb-labs/adapters-state-broker → StateBrokerCache
```

### Configuration-Driven Injection

```json
// .kb/kb.config.json
{
  "platform": {
    "adapters": {
      "cache": "@kb-labs/adapters-redis",
      "db": "@kb-labs/adapters-sqlite",
      "logger": "@kb-labs/adapters-pino",
      "llm": "@kb-labs/adapters-openai",
      "vectorStore": "@kb-labs/adapters-qdrant",
      "metrics": "@kb-labs/adapters-prometheus"
    },
    "adapterOptions": {
      "cache": { "url": "redis://localhost:6379" },
      "db": { "filename": ".kb/database/kb.sqlite" },
      "llm": { "defaultModel": "gpt-4o-mini" },
      "vectorStore": { "url": "http://localhost:6333" }
    }
  }
}
```

### All Available Adapters

| Adapter Type | Interface | Available Implementations |
|--------------|-----------|---------------------------|
| **Cache** | `ICache` | InMemory, Redis, Memcached, StateBroker |
| **Database** | `IDatabase` | SQLite, PostgreSQL, MySQL |
| **Document DB** | `IDocumentDB` | MongoDB, InMemory |
| **Vector Store** | `IVectorStore` | Local, Qdrant, Pinecone, Weaviate |
| **Logger** | `ILogger` | Console, Pino, Winston, Datadog |
| **Metrics** | `IMetrics` | InMemory, Prometheus, Datadog |
| **LLM** | `ILLMProvider` | OpenAI, Anthropic, Local (Ollama) |
| **Embeddings** | `IEmbeddingProvider` | OpenAI, Cohere, Local |
| **Storage** | `IStorage` | Filesystem, S3, GCS, Azure Blob |
| **Analytics** | `IAnalytics` | File, S3, BigQuery, Snowflake |

### Adapter Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                  Platform Initialization                    │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │  1. Read kb.config.json            │
         │     Extract adapters config        │
         └────────────────┬───────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │  2. Load Adapter Factories         │
         │     Dynamic import from packages   │
         └────────────────┬───────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │  3. Initialize Adapters            │
         │     Pass adapterOptions            │
         └────────────────┬───────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │  4. Inject into Platform Context   │
         │     runtime.cache, runtime.db...   │
         └────────────────┬───────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │  5. Make Available to Plugins      │
         │     Plugins receive PluginContext  │
         └────────────────────────────────────┘
```

### Development → Startup → Enterprise

**Same codebase, different configs:**

```bash
# Development ($0/month)
KB_ENV=development pnpm kb workflow:run --workflow-id dev-test
# Uses: InMemory cache, SQLite, Console logger, Local vector store

# Startup (~$100/month)
KB_ENV=staging pnpm kb workflow:run --workflow-id staging-deploy
# Uses: Redis, PostgreSQL, Pino logger, Qdrant

# Enterprise (~$1K+/month)
KB_ENV=production pnpm kb workflow:run --workflow-id prod-deploy
# Uses: Redis Cluster, PostgreSQL RDS, Datadog, Qdrant Cloud
```

**No code changes. Just config.**

---

## Execution Layer

**Core Principle:** Platform handles HOW code runs (in-process, subprocess, worker pool, remote), plugin authors focus on WHAT code does.

### Execution Modes

KB Labs supports 4 execution modes with different security/performance trade-offs:

```
┌────────────────┬─────────────┬──────────────┬─────────────┬───────────┐
│ Mode           │ Isolation   │ Latency      │ Fault       │ Use Case  │
│                │             │              │ Tolerance   │           │
├────────────────┼─────────────┼──────────────┼─────────────┼───────────┤
│ InProcess      │ None        │ ~1ms         │ Low         │ Dev/Test  │
│ Subprocess     │ Process     │ ~10ms        │ Medium      │ Production│
│ WorkerPool     │ Process     │ ~10-50ms     │ High        │ High Load │
│ Remote         │ Network     │ ~100-500ms   │ Very High   │ Enterprise│
└────────────────┴─────────────┴──────────────┴─────────────┴───────────┘
```

### 1. InProcess Execution (Dev Mode)

**How it works:** Direct function calls, no isolation.

```typescript
// Plugin handler runs in same process
const result = await pluginHandler(input);
```

**Pros:**
- ✅ Lowest latency (~1ms overhead)
- ✅ Easy debugging (breakpoints work)
- ✅ No process management

**Cons:**
- ❌ No fault isolation (crash kills entire platform)
- ❌ No resource limits (can exhaust memory)
- ❌ Blocking execution (one slow plugin blocks others)

**Use case:** Local development, testing, debugging

### 2. Subprocess Execution (Production)

**How it works:** Each plugin runs in isolated Node.js subprocess.

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Platform Process                    │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Subprocess Execution Backend               │   │
│  │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐      │   │
│  │  │Plugin A│  │Plugin B│  │Plugin C│  │Plugin D│      │   │
│  │  │Process │  │Process │  │Process │  │Process │      │   │
│  │  └────────┘  └────────┘  └────────┘  └────────┘      │   │
│  │       │           │           │           │          │   │
│  │       │  IPC      │  IPC      │  IPC      │  IPC     │   │
│  │       └───────────┴───────────┴───────────┘          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Process isolation (crash doesn't kill platform)
- ✅ Resource tracking (CPU, memory per plugin)
- ✅ Graceful degradation (failed plugin doesn't block others)

**Cons:**
- ⚠️ Higher latency (~10ms overhead)
- ⚠️ IPC serialization cost
- ⚠️ Process management overhead

**Use case:** Production deployments, trusted plugins

### 3. WorkerPool Execution (High Load)

**How it works:** Pool of reusable worker processes, jobs queued.

```
┌─────────────────────────────────────────────────────────────┐
│                  WorkerPool Backend                         │
│  ┌────────────────────────────────────────────────────┐     │
│  │              Job Queue (FIFO)                      │     │
│  │  [ Job1 ] [ Job2 ] [ Job3 ] [ Job4 ] [ Job5 ]      │     │
│  └──────────┬─────────┬─────────┬─────────────────────┘     │
│             │         │         │                           │
│  ┌──────────▼──┐  ┌──▼─────┐  ┌▼──────────┐                 │
│  │  Worker 1   │  │Worker 2│  │  Worker 3 │                 │
│  │  (idle)     │  │(busy)  │  │  (busy)   │                 │
│  └─────────────┘  └────────┘  └───────────┘                 │
│                                                             │
│  Config: maxWorkers: 10, maxQueueSize: 1000                 │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ High concurrency (handles 100+ concurrent jobs)
- ✅ Fault tolerance (dead workers auto-restarted)
- ✅ Resource pooling (reuse processes)
- ✅ Queue-based scheduling (fair execution)

**Cons:**
- ⚠️ Queue latency (~10-50ms depending on load)
- ⚠️ More complex (worker lifecycle management)

**Use case:** High-traffic production, burst workloads

### 4. Remote Execution (Planned - Phase 3)

**Status:** Interface defined, implementation planned for Phase 3 (enterprise scale).

**Planned architecture:** Distributed execution clusters, horizontal scaling.

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Platform (API)                      │
└──────────────────────────┬──────────────────────────────────┘
                           │ gRPC / HTTP
          ┌────────────────┼────────────────┐
          │                │                │
┌─────────▼────-─┐  ┌──────▼──────-┐  ┌─────▼────────┐
│ Executor       │  │ Executor     │  │ Executor     │
│ Cluster 1      │  │ Cluster 2    │  │ Cluster 3    │
│ (US-East)      │  │ (US-West)    │  │ (EU-West)    │
│                │  │              │  │              │
│ [ Worker ]     │  │ [ Worker ]   │  │ [ Worker ]   │
│ [ Worker ]     │  │ [ Worker ]   │  │ [ Worker ]   │
│ [ Worker ]     │  │ [ Worker ]   │  │ [ Worker ]   │
└────────────────┘  └──────────────┘  └──────────────┘
```

**Planned benefits:**
- ✅ Horizontal scaling (add more clusters)
- ✅ Multi-region support (geo-distributed)
- ✅ Dedicated resources (per-tenant clusters)
- ✅ Maximum fault tolerance

**Trade-offs:**
- ⚠️ Higher latency (~100-500ms network overhead)
- ⚠️ Complex infrastructure (cluster management)
- ⚠️ Higher cost

**Use case:** Enterprise scale, multi-region deployments (future)

### Execution Configuration

```json
// .kb/kb.config.json
{
  "platform": {
    "execution": {
      "mode": "subprocess",  // or "in-process", "worker-pool" (remote: planned)
      "options": {
        // Subprocess options
        "timeout": 300000,        // 5 minutes
        "maxRetries": 3,

        // WorkerPool options (if mode=worker-pool)
        "maxWorkers": 10,
        "maxQueueSize": 1000,
        "workerIdleTimeout": 60000
      }
    }
  }
}
```

### Execution Flow

```
┌────────────────────────────────────────────────────────────┐
│  1. User Invokes Command                                   │
│     pnpm kb workflow:run --workflow-id my-workflow         │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  2. Platform Resolves Plugin Handler                       │
│     - Load plugin manifest                                 │
│     - Validate permissions                                 │
│     - Resolve handler file path                            │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  3. Create Execution Request                               │
│     {                                                      │
│       executionId: "uuid",                                 │
│       descriptor: { ... },  // PluginContext               │
│       pluginRoot: "/path/to/plugin",                       │
│       handlerRef: "dist/handlers/workflow.js",             │
│       input: { workflowId: "my-workflow" },                │
│       timeoutMs: 300000                                    │
│     }                                                      │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  4. Execution Backend Executes                             │
│     - InProcess: direct call                               │
│     - Subprocess: spawn process, IPC                       │
│     - WorkerPool: enqueue job, worker picks up             │
│     - Remote: gRPC call to executor cluster                │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  5. Plugin Handler Runs                                    │
│     - Receives PluginContext (runtime, config, input)      │
│     - Access adapters (cache, db, logger, etc.)            │
│     - Execute business logic                               │
│     - Return result                                        │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  6. Platform Returns Result                                │
│     {                                                      │
│       ok: true,                                            │
│       data: { ... },                                       │
│       executionTimeMs: 1234,                               │
│       metadata: { backend: "subprocess", ... }             │
│     }                                                      │
└────────────────────────────────────────────────────────────┘
```

---

## Plugin System

**Core Principle:** Plugins extend platform capabilities without modifying core code. Manifest-based permissions, automatic resource tracking, platform-provided infrastructure.

### Plugin Architecture

```
┌────────────────────────────────────────────────────────────---─┐
│                      Plugin Package                            │
│  ┌───────────────────────────────────────────────────────---┐  │
│  │  plugin.manifest.json                                    │  │
│  │  {                                                       │  │
│  │    "id": "mind-rag",                                     │  │
│  │    "version": "1.0.0",                                   │  │
│  │    "permissions": {                                      │  │
│  │      "cache": ["read", "write"],                         │  │
│  │      "database": ["read"],                               │  │
│  │      "vectorStore": ["read", "write"],                   │  │
│  │      "llm": ["query"]                                    │  │
│  │    },                                                    │  │
│  │    "commands": [                                         │  │
│  │      { "name": "rag-query", "handler": "dist/query.js" } │  │
│  │    ]                                                     │  │
│  │  }                                                       │  │
│  └──────────────────────────────────────────────────────---─┘  │
│  ┌──────────────────────────────────────────────────────---─┐  │
│  │  src/handlers/query.ts                                   │  │
│  │  export async function ragQuery(ctx: PluginContext) {    │  │
│  │    // Access adapters from context                       │  │
│  │    const cached = await ctx.runtime.cache.get(key);      │  │
│  │    const results = await ctx.runtime.vectorStore         │  │
│  │      .search(query);                                     │  │
│  │    return { results };                                   │  │
│  │  }                                                       │  │
│  └───────────────────────────────────────────────────────---┘  │
└─────────────────────────────────────────────────────────────---┘
```

### Plugin Context (What Plugins Receive)

```typescript
// packages/plugin-contracts/src/context.ts
export interface PluginContext {
  // Runtime adapters (injected by platform)
  runtime: {
    cache: ICache;
    db: IDatabase;
    logger: ILogger;
    vectorStore: IVectorStore;
    llm: ILLMProvider;
    metrics: IMetrics;
    state: IStateBroker;
  };

  // Plugin configuration
  config: PluginConfig;

  // Execution metadata
  executionId: string;
  tenantId: string;

  // Input data
  input: unknown;
}
```

**What platform provides automatically:**
- ✅ All infrastructure adapters (cache, DB, logger, metrics, etc.)
- ✅ Structured logging with context
- ✅ Automatic metrics collection (execution time, success/failure)
- ✅ Resource tracking (CPU, memory)
- ✅ Multi-tenancy isolation
- ✅ Error handling and retries
- ✅ Rate limiting and quotas

**What plugin authors write:**
- ✅ Business logic only
- ✅ Zero infrastructure code
- ✅ Pure functions with clear inputs/outputs

### Permission Model

Plugins declare what resources they need in manifest:

```json
{
  "permissions": {
    "cache": ["read", "write"],           // ✅ Full cache access
    "database": ["read"],                 // ✅ Read-only DB
    "filesystem": false,                  // ❌ No FS access
    "network": ["https://api.github.com"] // ✅ Only GitHub API
  }
}
```

**Platform enforces permissions:**
- ✅ Plugins can only access declared resources
- ✅ Network requests limited to whitelisted domains
- ✅ Filesystem access blocked unless granted
- ✅ CPU/memory limits enforced

### Plugin Discovery & Loading

```
┌────────────────────────────────────────────────────────────┐
│  1. Plugin Discovery                                       │
│     - Scan node_modules for @kb-labs/plugin-*              │
│     - Scan .kb/plugins for local plugins                   │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  2. Manifest Validation                                    │
│     - Check required fields (id, version, commands)        │
│     - Validate permissions schema                          │
│     - Check handler files exist                            │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  3. Register Commands                                      │
│     - Map command names to handler paths                   │
│     - Register in CLI command registry                     │
│     - Generate --help documentation                        │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  4. Plugin Ready for Execution                             │
│     - User runs: pnpm kb <plugin>:<command> [args]         │
│     - Platform validates permissions                       │
│     - Executes handler with PluginContext                  │
└────────────────────────────────────────────────────────────┘
```

### Built-In Plugins

**Mind RAG** — AI-powered semantic code search
- Permissions: `vectorStore`, `llm`, `cache`, `database`
- Commands: `rag-query`, `rag-index`
- Use case: "Where is authentication implemented?"

**Commit Plugin** — LLM-powered conventional commits
- Permissions: `llm`, `cache`, `filesystem` (git only)
- Commands: `commit`
- Use case: Generate commits from git diff

**Release Manager** — Automated semantic versioning
- Permissions: `filesystem`, `network` (npm, GitHub)
- Commands: `release`
- Use case: Publish to npm with changelog

**DevKit** — Monorepo health checks
- Permissions: `filesystem`, `cache`
- Commands: 18 tools (health, types-audit, fix-deps, etc.)
- Use case: Manage ~80 packages across 18 repos

---

## Workflow Engine

**Core Principle:** Priority queue scheduling with dependency resolution. Workflows define WHAT happens, platform handles HOW.

### Workflow Definition (YAML)

```yaml
# .kb/workflows/deploy-to-staging.yaml
id: deploy-to-staging
name: Deploy to Staging Environment
version: 1.0.0

# DAG structure
jobs:
  - id: run-tests
    plugin: test-runner
    command: run
    input:
      scope: "packages/core/**"

  - id: build-packages
    plugin: build
    command: build-all
    dependsOn: [run-tests]

  - id: deploy-api
    plugin: deploy
    command: deploy-api
    dependsOn: [build-packages]
    input:
      environment: staging

  - id: deploy-ui
    plugin: deploy
    command: deploy-ui
    dependsOn: [build-packages]
    input:
      environment: staging

  - id: smoke-tests
    plugin: test-runner
    command: smoke-tests
    dependsOn: [deploy-api, deploy-ui]
```

### Workflow Execution Flow

```
┌────────────────────────────────────────────────────────────┐
│  User: pnpm kb workflow:run --workflow-id deploy-to-staging│
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  1. Workflow Runtime                                       │
│     - Load workflow YAML                                   │
│     - Parse job definitions                                │
│     - Build dependency DAG                                 │
│     - Validate no cycles                                   │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  2. Job Scheduler (Priority Queue)                         │
│     - Enqueue jobs without dependencies into priority      │
│       queues: high, normal, low (Redis sorted sets)        │
│     - Jobs with dependencies remain blocked                │
│     - Dequeue jobs by priority order (high → normal → low) │
└──────────────────────┬─────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  3. Execute Jobs                                           │
│                                                            │
│     run-tests                                              │
│         │                                                  │
│         ▼                                                  │
│     build-packages                                         │
│         │                                                  │
│         ├─────────────┬──────────────┐                     │
│         ▼             ▼              ▼                     │
│     deploy-api    deploy-ui      (parallel)                │
│         │             │                                    │
│         └─────────────┴──────────────┐                     │
│                       ▼              ▼                     │
│                   smoke-tests                              │
└────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────────────────────┐
│  4. State Management                                       │
│     - Track job states (pending → running → completed)     │
│     - Store in database                                    │
│     - Emit events for observability                        │
└────────────────────────────────────────────────────────────┘
```

### Job States

```
pending → queued → running → completed
                     │
                     ├─> failed → retrying → running
                     │                 │
                     │                 └─> failed (max retries)
                     │
                     └─> cancelled
```

### Scheduler Implementation

**How it works:**

1. **Priority Queues (Redis Sorted Sets):**
   - 3 queues: `kb:jobqueue:high`, `kb:jobqueue:normal`, `kb:jobqueue:low`
   - Score = timestamp when job becomes available
   - Jobs dequeued in priority order: high → normal → low

2. **Dependency Resolution:**
   - Jobs track `needs` (list of job names)
   - Jobs track `pendingDependencies` (remaining dependencies)
   - Jobs with dependencies are **blocked** (not enqueued)
   - When a job completes, dependent jobs' `pendingDependencies` decremented
   - When `pendingDependencies` reaches 0, job becomes unblocked and enqueued

3. **Parallel Execution:**
   - Multiple jobs can be dequeued simultaneously if they have no dependencies
   - Example: `deploy-api` and `deploy-ui` can run in parallel if both have no pending dependencies

**Benefits:**
- ✅ Priority-based scheduling (critical jobs run first)
- ✅ Automatic parallelization (independent jobs run concurrently)
- ✅ Fault tolerance (failed jobs can be retried without re-running entire workflow)
- ✅ Horizontal scaling (multiple workers dequeue from shared Redis queues)

---

## Multi-Tenancy & Quotas

**Core Principle:** Platform supports multiple tenants with isolated resources and enforced quotas.

### Tenant Tiers

```
┌───────────────┬──────────┬────────────┬────────────┬──────────┐
│ Tier          │ API RPM  │ Workflows  │ Concurrent │ Storage  │
│               │          │ /Day       │ Jobs       │          │
├───────────────┼──────────┼────────────┼────────────┼──────────┤
│ free          │ 100      │ 50         │ 2          │ 100 MB   │
│ pro           │ 1,000    │ 1,000      │ 10         │ 10 GB    │
│ enterprise    │ 100,000  │ 100,000    │ 1,000      │ 1 TB     │
└───────────────┴──────────┴────────────┴────────────┴──────────┘
```

### Rate Limiting

```typescript
// packages/tenant/src/rate-limiter.ts
export class TenantRateLimiter {
  async checkLimit(tenantId: string, operation: string): Promise<{
    allowed: boolean;
    retryAfterMs?: number;
  }> {
    const key = `tenant:${tenantId}:ratelimit:${operation}`;
    const quota = getQuotasForTier(tenant.tier);

    const count = await this.broker.increment(key, quota.windowMs);

    if (count > quota.limit) {
      return { allowed: false, retryAfterMs: quota.windowMs };
    }

    return { allowed: true };
  }
}
```

**Usage in REST API:**

```typescript
// middleware/rate-limit.ts
export async function rateLimitMiddleware(req, reply) {
  const tenantId = req.headers['x-tenant-id'] ?? 'default';
  const result = await limiter.checkLimit(tenantId, 'api');

  if (!result.allowed) {
    reply.code(429).header('Retry-After', String(result.retryAfterMs! / 1000));
    return { error: 'Rate limit exceeded' };
  }
}
```

### Tenant Isolation

**State Broker:**
```
tenant:acme:mind:query-123        ← Tenant "acme" namespace
tenant:startup-co:mind:query-456  ← Tenant "startup-co" namespace
tenant:default:mind:query-789     ← Default tenant
```

**Database:**
```sql
-- Workflows table
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,  -- ← Tenant isolation
  name TEXT,
  ...
  INDEX idx_tenant_id (tenant_id)
);
```

**Metrics:**
```
kb_tenant_request_total{tenant="acme"}          1234
kb_tenant_request_errors_total{tenant="acme"}   12
kb_tenant_workflow_runs{tenant="startup-co"}    567
```

---

## Observability & Monitoring

**Core Principle:** Platform provides built-in observability. Plugins get it for free.

### Metrics (Prometheus)

```
# HTTP Requests
kb_http_request_total{method="POST", path="/api/workflow/run", status="200"}
kb_http_request_duration_seconds{method="POST", path="/api/workflow/run"}

# Workflow Execution
kb_workflow_runs_total{workflow_id="deploy", status="completed"}
kb_workflow_duration_seconds{workflow_id="deploy"}

# Plugin Execution
kb_plugin_execution_total{plugin="mind-rag", command="query", status="success"}
kb_plugin_execution_duration_seconds{plugin="mind-rag", command="query"}

# System Health
kb_system_cpu_percent
kb_system_memory_used_bytes
kb_system_instances_total{status="active"}
```

### Logging (Structured)

```json
{
  "timestamp": "2026-01-12T10:30:45.123Z",
  "level": "info",
  "context": {
    "executionId": "exec-uuid",
    "tenantId": "acme-corp",
    "plugin": "mind-rag",
    "command": "query"
  },
  "message": "Query executed successfully",
  "metadata": {
    "confidence": 0.78,
    "resultsCount": 5,
    "durationMs": 234
  }
}
```

### Incidents (Auto-Detection)

```
┌───────────────────────────────────────────────────────-─────┐
│  Incident Detection Pipeline                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. Metrics Collection (Prometheus scrape)           │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     │                                       │
│  ┌──────────────────▼───────────────────────────────────┐   │
│  │  2. Anomaly Detection                                │   │
│  │     - Error rate > threshold                         │   │
│  │     - Response time spike                            │   │
│  │     - Instance down                                  │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     │                                       │
│  ┌──────────────────▼───────────────────────────────────┐   │
│  │  3. Create Incident                                  │   │
│  │     {                                                │   │
│  │       severity: "critical",                          │   │
│  │       title: "API Error Rate Spike",                 │   │
│  │       rootCause: "Database connection timeout"       │   │
│  │     }                                                │   │
│  └──────────────────┬───────────────────────────────────┘   │
│                     │                                       │
│  ┌──────────────────▼───────────────────────────────────┐   │
│  │  4. Notify & Track                                   │   │
│  │     - Send alerts (Slack, PagerDuty)                 │   │
│  │     - Display in Studio UI                           │   │
│  │     - Track resolution                               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────-──┘
```

---

## Data Flow Examples

### Example 1: Mind RAG Query

```
User CLI Command:
  pnpm kb mind rag-query --text "Where is auth implemented?"
         │
         ▼
  CLI Plugin Loader
    - Load mind-rag plugin manifest
    - Validate permissions (vectorStore, llm, cache, db)
         │
         ▼
  Plugin Execution Backend (Subprocess)
    - Spawn mind-rag process
    - Pass PluginContext (runtime adapters, config, input)
         │
         ▼
  Mind RAG Handler
    1. Check cache for query
       └─> runtime.cache.get("query:hash")
    2. If miss, generate embeddings
       └─> runtime.llm.embed(query)
    3. Search vector store
       └─> runtime.vectorStore.search(embedding)
    4. Retrieve code chunks
       └─> runtime.db.query("SELECT code FROM chunks WHERE id IN (...)")
    5. Re-rank with LLM
       └─> runtime.llm.query("Given chunks, answer: ...")
    6. Cache result
       └─> runtime.cache.set("query:hash", result, ttl)
         │
         ▼
  Return Result to CLI
    {
      answer: "Auth is in packages/auth/src/auth-service.ts:42",
      confidence: 0.78,
      sources: [...]
    }
```

### Example 2: Workflow Execution

```
User CLI Command:
  pnpm kb workflow:run --workflow-id deploy-to-staging
         │
         ▼
  Workflow Runtime
    - Load workflow YAML
    - Build DAG (5 jobs)
    - Validate no cycles
         │
         ▼
  Job Scheduler
    - Calculate execution layers:
      Layer 0: [run-tests]
      Layer 1: [build-packages]
      Layer 2: [deploy-api, deploy-ui]  ← Parallel
      Layer 3: [smoke-tests]
         │
         ▼
  Execute Layer 0 (run-tests)
    - Create JobRun record in DB
    - Update state: pending → running
    - Execute test-runner plugin
    - Wait for completion
    - Update state: running → completed
         │
         ▼
  Execute Layer 1 (build-packages)
    - Same flow as Layer 0
         │
         ▼
  Execute Layer 2 (deploy-api, deploy-ui) [PARALLEL]
    - Spawn 2 concurrent executions
    - Both run simultaneously
    - Wait for both to complete
         │
         ▼
  Execute Layer 3 (smoke-tests)
    - Final job after parallel completion
         │
         ▼
  Workflow Completed
    - Update WorkflowRun state: running → completed
    - Emit metrics (kb_workflow_runs_total)
    - Return summary to CLI
```

---

## Performance Characteristics

### Latency Breakdown

```
InProcess Execution:
  ├─ Platform overhead:        ~1ms
  ├─ Permission check:         ~0.5ms
  ├─ Context creation:         ~0.5ms
  ├─ Handler execution:        [business logic time]
  └─ Total overhead:           ~2ms

Subprocess Execution:
  ├─ Platform overhead:        ~1ms
  ├─ Process spawn:            ~8ms
  ├─ IPC serialization:        ~1ms
  ├─ Permission check:         ~0.5ms
  ├─ Context creation:         ~0.5ms
  ├─ Handler execution:        [business logic time]
  ├─ IPC response:             ~1ms
  └─ Total overhead:           ~12ms

WorkerPool Execution:
  ├─ Platform overhead:        ~1ms
  ├─ Queue enqueue:            ~0.5ms
  ├─ Queue latency:            ~5-50ms (depends on load)
  ├─ Worker pickup:            ~1ms
  ├─ IPC serialization:        ~1ms
  ├─ Permission check:         ~0.5ms
  ├─ Handler execution:        [business logic time]
  └─ Total overhead:           ~10-55ms
```

### Scalability Limits

```
InProcess:
  - Concurrent executions:     Limited by CPU cores (~4-16)
  - Memory:                    Shared process memory
  - Throughput:                ~1000 req/s (simple handlers)

Subprocess:
  - Concurrent executions:     ~100 processes (OS limits)
  - Memory:                    ~50MB per process
  - Throughput:                ~500 req/s

WorkerPool:
  - Concurrent executions:     Configurable (10-1000 workers)
  - Memory:                    ~50MB per worker
  - Throughput:                ~5000 req/s (with 100 workers)

Remote:
  - Concurrent executions:     Unlimited (horizontal scaling)
  - Memory:                    Distributed across clusters
  - Throughput:                ~100K+ req/s (multi-cluster)
```

---

## Design Trade-Offs

### Adapter Abstraction Overhead

**Trade-off:** ~1-2% performance overhead for flexibility.

```typescript
// Direct Redis call (no adapter)
await redisClient.get(key);  // ~1ms

// Adapter call
await runtime.cache.get(key);  // ~1.02ms (+2% overhead)
```

**Why we accept this:**
- ✅ Complete flexibility (swap Redis → Memcached in config)
- ✅ Testability (mock adapters in tests)
- ✅ Future-proof (add new backends without code changes)
- ⚠️ 2% overhead is negligible vs migration cost (6 months rewrite)

### Plugin Isolation vs Performance

**Trade-off:** Higher latency for fault tolerance.

```
InProcess:  ~1ms latency, no isolation  → Dev mode
Subprocess: ~12ms latency, full isolation → Production
```

**Why we offer both:**
- ✅ Dev: Fast iteration, easy debugging (InProcess)
- ✅ Prod: Fault tolerance, resource limits (Subprocess)
- ✅ Choice: Users pick mode based on needs

### Manifest Permissions vs Developer Freedom

**Trade-off:** Explicit permissions require more upfront work.

**Without manifests (traditional):**
```typescript
// Plugin can do anything - security risk
import fs from 'fs';
fs.writeFileSync('/etc/passwd', '...'); // 💀 Dangerous
```

**With manifests (KB Labs):**
```json
{
  "permissions": {
    "filesystem": false  // ❌ Blocked by platform
  }
}
```

**Why we enforce this:**
- ✅ Security (untrusted plugins can't access sensitive resources)
- ✅ Transparency (users see what plugins access)
- ✅ Marketplace trust (verified permissions)
- ⚠️ More boilerplate for plugin authors

---

## Summary

KB Labs architecture is built on three core pillars:

1. **Adapter-First** — Swap any infrastructure component in config
2. **Execution Flexibility** — Scale from laptop to enterprise cluster
3. **Platform-Provided Infrastructure** — Plugins write business logic, platform handles everything else

**Key benefits:**
- ✅ Zero vendor lock-in
- ✅ Progressive complexity ($0 → $1K+)
- ✅ Production-ready patterns
- ✅ Built-in observability

**Trade-offs we made:**
- ⚠️ ~2% adapter overhead (worth it for flexibility)
- ⚠️ Manifest permissions (worth it for security)
- ⚠️ Higher latency in isolated modes (worth it for fault tolerance)

---

**Related Documentation:**
- [Architecture Decision Records](./adr/) — Design decisions
- [Products Overview](./products/README.md) — Individual components
- [Roadmap](./roadmap/README.md) — Future plans

**Last Updated:** 2026-01-12
