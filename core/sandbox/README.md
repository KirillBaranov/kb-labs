# @kb-labs/sandbox

> **Universal sandbox isolation system for executing untrusted code in KB Labs ecosystem.** Provides secure execution environment with resource limits, monitoring, and isolation for CLI and REST API handlers.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18.18.0+-green.svg)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-9.0.0+-orange.svg)](https://pnpm.io/)

## 🎯 Vision & Purpose

**@kb-labs/sandbox** provides universal sandbox isolation system for executing untrusted code in KB Labs ecosystem. It supports both fork-based isolation (subprocess) and in-process execution modes, with resource limits, monitoring, and comprehensive security controls.

## 🏗️ Architecture

### Core Components

#### Sandbox Runner

- **Purpose**: Execute code in isolated environment
- **Responsibilities**: Resource management, security enforcement, monitoring
- **Dependencies**: None (pure Node.js)

#### Execution Modes

- **Subprocess Mode**: Fork-based isolation with resource limits
- **In-Process Mode**: Fast execution for development (no isolation)

#### Monitoring System

- **Purpose**: Collect execution data
- **Responsibilities**: Log collection, metrics tracking, trace collection
- **Dependencies**: None

### Design Patterns

- **Strategy Pattern**: Different execution strategies (subprocess/in-process)
- **Factory Pattern**: Sandbox runner creation
- **Observer Pattern**: Lifecycle hooks

### Data Flow

```
createSandboxRunner(config)
    │
    ├──► Create runner (subprocess or in-process)
    ├──► Configure resource limits
    ├──► Setup security controls
    ├──► Initialize monitoring
    └──► return SandboxRunner

sandbox.run(handler, input, context)
    │
    ├──► Validate preflight checks
    ├──► Setup resource limits
    ├──► Execute handler
    ├──► Collect logs/metrics/traces
    ├──► Enforce timeout
    └──► return ExecutionResult
```

## 🚀 Quick Start

### Installation

```bash
pnpm add @kb-labs/sandbox
```

### Basic Usage

```typescript
import { createSandboxRunner } from '@kb-labs/sandbox';

const sandbox = createSandboxRunner({
  execution: {
    timeoutMs: 30000,
    memoryMb: 512,
  },
  mode: 'subprocess',
});

const result = await sandbox.run(
  { file: './handler.js', export: 'handle' },
  { message: 'Hello' },
  { /* context */ }
);
```

## ✨ Features

- **Fork-based isolation** - Subprocess execution with resource limits
- **In-process mode** - Fast execution for development (no isolation)
- **Resource limits** - Memory, CPU, and timeout enforcement
- **Log collection** - Ring buffer for capturing stdout/stderr
- **Metrics tracking** - CPU, memory, and execution time
- **Distributed tracing** - Support for trace propagation

## Installation

```bash
pnpm add @kb-labs/sandbox
```

## Usage

### Basic Example

```typescript
import { createSandboxRunner } from '@kb-labs/sandbox';

const sandbox = createSandboxRunner({
  execution: {
    timeoutMs: 30000,
    graceMs: 5000,
    memoryMb: 512,
  },
  permissions: {
    env: { allow: ['NODE_ENV', 'PATH'] },
    filesystem: { allow: [], deny: [], readOnly: false },
    network: { allow: [], deny: [] },
    capabilities: [],
  },
  monitoring: {
    collectLogs: true,
    collectMetrics: true,
    collectTraces: false,
    logBufferSizeMb: 1,
  },
  mode: 'subprocess',
});

const result = await sandbox.run(
  { file: './handler.js', export: 'handle' },
  { message: 'Hello' },
  {
    requestId: 'req-123',
    workdir: process.cwd(),
    debug: false,
  }
);

if (result.ok) {
  console.log('Success:', result.data);
  console.log('Metrics:', result.metrics);
} else {
  console.error('Error:', result.error);
}
```

### Configuration

#### Execution Limits

```typescript
execution: {
  timeoutMs: 30000,     // Max execution time
  graceMs: 5000,        // SIGTERM → SIGKILL grace period
  memoryMb: 512,        // Memory limit
}
```

#### Permissions

```typescript
permissions: {
  env: {
    allow: ['NODE_ENV', 'PATH', 'HOME']  // Whitelisted env vars
  },
  filesystem: {
    allow: ['/tmp', '/app/data'],        // Allowed paths
    deny: ['/etc', '/root'],             // Denied paths
    readOnly: false                      // Read-only mode
  },
  network: {
    allow: ['example.com'],              // Allowed domains
    deny: ['internal.corp']              // Denied domains
  },
  capabilities: ['fs:read', 'net:fetch'] // Custom capabilities
}
```

#### Monitoring

```typescript
monitoring: {
  collectLogs: true,         // Enable log collection
  collectMetrics: true,      // Track CPU/memory
  collectTraces: true,       // Distributed tracing
  logBufferSizeMb: 1,       // Log buffer size
}
```

### Modes

**subprocess** - Fork-based isolation (production)
- Full isolation
- Resource limits enforced
- Timeout protection
- Separate process space

**inprocess** - Direct execution (development)
- No isolation
- Fast execution
- Easy debugging
- Use only for trusted code

### Dev Mode

Set `devMode: true` or `KB_PLUGIN_DEV_MODE=true` environment variable to force in-process execution.

## Integration Examples

### Plugin Runtime

```typescript
import { createSandboxRunner } from '@kb-labs/sandbox';

const sandbox = createSandboxRunner({
  execution: {
    timeoutMs: perms.quotas?.timeoutMs ?? 60000,
    graceMs: 5000,
    memoryMb: perms.quotas?.memoryMb ?? 512,
  },
  permissions: {
    env: { allow: perms.env?.allow || [] },
    filesystem: { allow: [], deny: [], readOnly: false },
    network: { allow: [], deny: [] },
    capabilities: perms.capabilities || [],
  },
  monitoring: {
    collectLogs: ctx.debug || false,
    collectMetrics: true,
    collectTraces: true,
    logBufferSizeMb: 1,
  },
  mode: devMode ? 'inprocess' : 'subprocess',
});
```

### CLI Runtime

```typescript
const sandbox = createSandboxRunner({
  execution: { timeoutMs: 30000, graceMs: 5000, memoryMb: 256 },
  permissions: {
    env: { allow: ['NODE_ENV', 'PATH', 'HOME'] },
    filesystem: { allow: [workdir], deny: [], readOnly: false },
    network: { allow: ['*'], deny: [] },
    capabilities: [],
  },
  monitoring: {
    collectLogs: true,
    collectMetrics: true,
    collectTraces: false,
    logBufferSizeMb: 1,
  },
  mode: 'subprocess',
});
```

## Security Model

### Isolation Levels

1. **Process Isolation** - Separate process space (subprocess mode)
2. **Environment Isolation** - Whitelisted environment variables only
3. **Resource Limits** - Memory and CPU quotas
4. **Timeout Protection** - Automatic termination (SIGTERM → SIGKILL)

### Future Enhancements

- Filesystem guards (path restrictions)
- Network guards (domain whitelisting)
- Syscall filtering
- Deno runtime support

## API Reference

### `createSandboxRunner(config: SandboxConfig): SandboxRunner`

Creates a configured sandbox runner.

### `SandboxRunner.run<TInput, TOutput>(handler, input, ctx): Promise<ExecutionResult<TOutput>>`

Executes a handler in the sandbox.

**Parameters:**
- `handler` - Handler reference (file path + export name)
- `input` - Input data
- `ctx` - Execution context

**Returns:**
- `ExecutionResult` - Result with data or error

### `SandboxRunner.dispose(): Promise<void>`

Cleanup resources.

## 🔧 Configuration

### Configuration Options

- **Execution Limits**: timeoutMs, graceMs, memoryMb
- **Permissions**: env, filesystem, network, capabilities
- **Monitoring**: collectLogs, collectMetrics, collectTraces, logBufferSizeMb
- **Mode**: subprocess (isolated) or inprocess (fast)

### Environment Variables

- `KB_PLUGIN_DEV_MODE`: Force in-process execution (development)

## 🤝 Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development guidelines.

## 📄 License

KB Public License v1.1 © KB Labs
