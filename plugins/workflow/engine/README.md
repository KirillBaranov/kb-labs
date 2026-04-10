# @kb-labs/workflow-engine

Workflow orchestration engine for KB Labs. Provides job scheduling, state management, Redis coordination, and workflow execution.

## Vision & Purpose

**@kb-labs/workflow-engine** provides workflow orchestration engine for KB Labs. It includes job scheduling, state management, Redis coordination, event bus, retry logic, concurrency control, and timeout handling.

### Core Goals

- **Job Scheduling**: Intelligent job scheduling with dependency resolution
- **Redis Coordination**: Distributed state management and coordination through Redis
- **Event Bus**: Event streaming for workflow observability
- **Retry Logic**: Configurable retry policies for jobs and steps
- **Concurrency Control**: Idempotency and concurrency group management
- **Timeout Handling**: Configurable timeouts for jobs and steps

## Package Status

- **Version**: 0.1.0
- **Stage**: Stable
- **Status**: Production Ready ✅

## Architecture

### High-Level Overview

```
Workflow Engine
    │
    ├──► WorkflowEngine (main orchestrator)
    ├──► Job Scheduling
    ├──► State Management
    ├──► Redis Coordination
    ├──► Event Bus
    ├──► Retry Logic
    ├──► Concurrency Control
    └──► Worker System
```

### Key Components

1. **Engine** (`engine.ts`): Main orchestration engine
2. **Scheduler** (`scheduler.ts`): Job scheduling with dependency resolution
3. **StateStore** (`state-store.ts`): State management
4. **RunCoordinator** (`run-coordinator.ts`): Run coordination
5. **ConcurrencyManager** (`concurrency-manager.ts`): Concurrency control
6. **JobRunner** (`job-runner.ts`): Job execution
7. **JobHandler** (`job-handler.ts`): Job handling
8. **Worker** (`worker.ts`): Worker system
9. **EventBus** (`event-bus.ts`): Event streaming
10. **Redis** (`redis.ts`): Redis client management
11. **ApprovalStepHandler** (`approval-step-handler.ts`): Approval step handling
12. **ArtifactMerger** (`artifact-merger.ts`): Cross-run artifact merging
13. **RunSnapshotStorage** (`run-snapshot.ts`): Snapshot storage for replay
14. **BudgetTracker** (`budget-tracker.ts`): Budget tracking and control

## ✨ Features

- **Job scheduling** with dependency resolution
- **Redis coordination** for distributed state
- **Event bus** for workflow observability
- **Retry logic** with configurable policies
- **Concurrency control** with idempotency
- **Timeout handling** for jobs and steps
- **Worker system** for background processing
- **State management** with Redis persistence
- **Nested workflows** - call workflows from within workflows
- **Conditional execution** - `if` expressions for steps and jobs
- **Step outputs** - capture and use outputs between steps
- **Job hooks** - pre/post/onSuccess/onFailure lifecycle hooks
- **Approval steps** - manual approval gates with Redis storage
- **Artifact merge** - merge artifacts from multiple runs with configurable strategies
- **Local replay** - replay workflows from snapshots with context restoration
- **Budget control** - track and limit workflow execution costs with extension points

## 📦 API Reference

### Main Exports

#### Engine Classes

- `WorkflowEngine`: Main orchestration engine
- `WorkflowWorker`: Worker for background processing
- `JobRunner`: Job execution runner
- `WorkflowJobHandler`: Job handler implementation

#### Factory Functions

- `createWorkflowWorker(options)`: Create workflow worker
- `createRedisClient(options)`: Create Redis client

#### Types & Interfaces

- `WorkflowEngineOptions`: Engine configuration
- `WorkflowWorkerOptions`: Worker configuration
- `CreateRunInput`: Run creation input
- `RunContext`: Run execution context

### Types & Interfaces

#### `WorkflowEngineOptions`

```typescript
interface WorkflowEngineOptions {
  redis?: CreateRedisClientOptions;
  scheduler?: SchedulerOptions;
  concurrency?: AcquireOptions;
  runCoordinator?: RunCoordinatorOptions;
  logger?: EngineLogger;
}
```

#### `WorkflowWorkerOptions`

```typescript
interface WorkflowWorkerOptions {
  engine: WorkflowEngine;
  maxConcurrentJobs?: number;
  capabilities?: string[];
  permissions?: PermissionSpec;
  logger?: {
    level: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  };
  reconnect?: CreateRedisClientOptions['reconnectStrategy'];
}
```

## 🔧 Configuration

### Configuration Options

All configuration via `WorkflowEngineOptions`:

- **redis**: Redis client configuration
- **scheduler**: Scheduler configuration
- **concurrency**: Concurrency control options
- **runCoordinator**: Run coordinator options
- **logger**: Logger configuration

### Environment Variables

- `KB_REDIS_URL`: Redis connection URL
- `LOG_LEVEL`: Logging level

## 🔗 Dependencies

### Runtime Dependencies

- `@kb-labs/core-sys` (`link:../../../kb-labs-core/packages/sys`): Core sys
- `@kb-labs/cli-core` (`link:../../../kb-labs-cli/packages/core`): CLI core
- `@kb-labs/plugin-manifest` (`link:../../../kb-labs-plugin/packages/manifest`): Plugin manifest
- `@kb-labs/plugin-runtime` (`link:../../../kb-labs-plugin/packages/runtime`): Plugin runtime
- `@kb-labs/workflow-artifacts` (`workspace:*`): Workflow artifacts
- `@kb-labs/workflow-constants` (`workspace:*`): Workflow constants
- `@kb-labs/workflow-contracts` (`workspace:*`): Workflow contracts
- `@kb-labs/workflow-runtime` (`workspace:*`): Workflow runtime
- `ioredis` (`^5.4.1`): Redis client
- `pino` (`^9.4.0`): Logger
- `yaml` (`^2.8.0`): YAML parsing
- `zod` (`^4.1.5`): Schema validation

### Development Dependencies

- `@kb-labs/devkit` (`link:../../../kb-labs-devkit`): DevKit presets
- `@types/node` (`^24.3.3`): Node.js types
- `tsup` (`^8.5.0`): TypeScript bundler
- `typescript` (`^5.6.3`): TypeScript compiler
- `vitest` (`^3.2.4`): Test runner

## 🧪 Testing

### Test Structure

```
src/__tests__/
├── job-runner.timeout.spec.ts
├── plugin-command-resolver.spec.ts
└── scheduler.priority.spec.ts
```

### Test Coverage

- **Current Coverage**: ~70%
- **Target Coverage**: 90%

## 📈 Performance

### Performance Characteristics

- **Time Complexity**: O(n) for scheduling, O(1) for state operations
- **Space Complexity**: O(n) where n = number of jobs
- **Bottlenecks**: Redis operations, job scheduling

## 🔒 Security

### Security Considerations

- **Redis Security**: Redis connection security
- **Permission Checking**: Capability checks before execution
- **Secrets Management**: Secrets management for workflows
- **Concurrency Control**: Idempotency and concurrency limits

### Known Vulnerabilities

- None

## 🐛 Known Issues & Limitations

### Known Issues

- None currently

### Limitations

- **Redis Dependency**: Requires Redis for distributed coordination
- **State Persistence**: State stored in Redis only

### Future Improvements

- **Alternative State Stores**: Support for other state stores
- **Enhanced Retry Policies**: More retry policy options

## 🔄 Migration & Breaking Changes

### Migration from Previous Versions

No breaking changes in current version (0.1.0).

### Breaking Changes in Future Versions

- None planned

## 📚 Examples

### Example 1: Create Engine and Run Workflow

```typescript
import { WorkflowEngine, createRedisClient } from '@kb-labs/workflow-engine';
import type { WorkflowSpec } from '@kb-labs/workflow-contracts';

const redis = await createRedisClient({
  url: process.env.KB_REDIS_URL || 'redis://localhost:6379',
});

const engine = new WorkflowEngine({
  redis,
  logger: getLogger('workflow'),
});

const run = await engine.run(spec, {
  idempotency: 'unique-key',
  concurrency: { group: 'my-group' },
});
```

### Example 2: Create Worker

```typescript
import { createWorkflowWorker } from '@kb-labs/workflow-engine';

const worker = createWorkflowWorker({
  engine,
  maxConcurrentJobs: 2,
  capabilities: ['fs.read'],
});

await worker.start();
```

### Example 3: Handle Events

```typescript
import { WorkflowEngine } from '@kb-labs/workflow-engine';

const engine = new WorkflowEngine({ redis });

engine.on('run.started', (event) => {
  console.log('Run started:', event.runId);
});

engine.on('run.completed', (event) => {
  console.log('Run completed:', event.runId);
});
```

## 🔧 Advanced Features

### Nested Workflows

The workflow engine supports calling workflows from within other workflows using the `workflow:` prefix:

```yaml
steps:
  - name: Call Child Workflow
    uses: workflow:workspace:child-workflow
    with:
      input: value
```

**Key Features:**
- **Workflow Registry**: Discovers workflows from workspace and plugins
- **Depth Guard**: Prevents infinite recursion with `maxDepth` configuration
- **Parent/Child Linkage**: Child runs include parent metadata for analytics
- **Cancellation Propagation**: Parent cancellation automatically cancels child runs
- **Mode Support**: Currently supports `mode: 'wait'` (MVP), `fire-and-forget` throws error

**Configuration:**
```json
{
  "workflow": {
    "maxDepth": 2,
    "workspaces": [".kb/workflows/**/*.yml"],
    "plugins": true
  }
}
```

### Conditional Execution

Steps and jobs can be conditionally executed using `if` expressions:

```yaml
jobs:
  deploy:
    if: ${{ trigger.type == 'push' && trigger.payload.ref == 'refs/heads/main' }}
    steps:
      - name: Deploy
        if: ${{ steps.tests.outputs.exitCode == 0 }}
        uses: builtin:shell
        with:
          command: npm run deploy
```

**Expression Context:**
- `env.*`: Environment variables
- `trigger.*`: Run trigger information
- `steps.<id>.outputs.*`: Step outputs
- Boolean literals and comparison operators

### Step Outputs

Steps can produce outputs accessible in subsequent steps:

```yaml
steps:
  - name: Generate Version
    id: version
    uses: builtin:shell
    with:
      command: echo "1.0.0"
  
  - name: Use Output
    uses: builtin:shell
    with:
      command: echo "Version: ${{ steps.version.outputs.result }}"
```

Outputs are automatically captured from step execution results and available in expressions.

### Job Hooks

Jobs can define hooks that run at different lifecycle stages:

```yaml
jobs:
  main:
    hooks:
      pre:
        - name: Setup
          uses: builtin:shell
          with:
            command: echo "Setting up..."
      post:
        - name: Cleanup
          uses: builtin:shell
          with:
            command: echo "Cleaning up..."
      onSuccess:
        - name: Notify Success
          uses: builtin:shell
          with:
            command: echo "✓ Success"
      onFailure:
        - name: Notify Failure
          uses: builtin:shell
          with:
            command: echo "✗ Failed"
    steps:
      - name: Main Task
        uses: builtin:shell
        with:
          command: echo "Running main task..."
```

**Hook Execution Order:**
1. `pre` hooks (before main steps)
2. Main steps
3. `post` hooks (always, after main steps)
4. `onSuccess` or `onFailure` hooks (based on job result)

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

MIT © KB Labs
