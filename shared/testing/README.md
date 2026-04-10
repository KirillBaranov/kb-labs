# @kb-labs/shared-testing

Test utilities for KB Labs plugin development — mock builders, platform setup, test context.

## Problem

Testing plugins is hard because of the **singleton gap**: composables like `useLLM()`, `useCache()`, `useLogger()` read from the global platform singleton (`@kb-labs/core-runtime`), but `createTestContext()` only populates `ctx.platform`. Code inside handlers that uses composables gets the uninitialized singleton instead of test mocks.

Additionally, existing mocks are noop functions — no `vi.fn()` spies, no way to configure specific responses, no call tracking.

## Solution

This package provides:

- **`setupTestPlatform()`** — bridges `ctx.platform` and the global singleton
- **`mockLLM()`** — fluent builder with prompt matching, streaming, error simulation, tool calls
- **`mockCache()`** — working in-memory cache with TTL and sorted sets
- **`mockStorage()`** — virtual filesystem on `Map<string, Buffer>`
- **`mockLogger()`** — logger with message recording
- **`createTestContext()`** — enhanced context factory that syncs everything automatically

All methods are `vi.fn()` spies — you get full assertion capabilities out of the box.

## Installation

Available as workspace dependency:

```json
{
  "devDependencies": {
    "@kb-labs/shared-testing": "link:../../../kb-labs-shared/packages/shared-testing"
  }
}
```

Or via SDK re-export:

```typescript
import { mockLLM, createTestContext } from '@kb-labs/sdk/testing';
```

## Quick Start

```typescript
import { createTestContext, mockLLM } from '@kb-labs/sdk/testing';
import { useLLM } from '@kb-labs/sdk';
import { describe, it, expect, afterEach } from 'vitest';

describe('my handler', () => {
  let cleanup: () => void;

  afterEach(() => cleanup());

  it('generates a commit message', async () => {
    const llm = mockLLM()
      .onComplete('commit').respondWith('feat: add login page')
      .onAnyComplete().respondWith('ok');

    const { ctx, cleanup: c } = createTestContext({ platform: { llm } });
    cleanup = c;

    // Both work — same mock instance:
    expect(ctx.platform.llm).toBe(llm);
    expect(useLLM()).toBe(llm);        // singleton gap solved!

    const res = await ctx.platform.llm.complete('Generate commit message');
    expect(res.content).toBe('feat: add login page');
    expect(llm.complete).toHaveBeenCalledOnce();
  });
});
```

## API Reference

### `setupTestPlatform(options)`

Sets mock adapters into the global platform singleton. Call `cleanup()` in `afterEach()`.

```typescript
import { setupTestPlatform, mockLLM, mockCache } from '@kb-labs/shared-testing';

const { platform, cleanup } = setupTestPlatform({
  llm: mockLLM(),
  cache: mockCache(),
});

// Now useLLM() and useCache() return these mocks
```

**Options:** `llm`, `cache`, `embeddings`, `vectorStore`, `storage`, `analytics`, `logger`, `eventBus` — all optional.

### `mockLLM()`

Fluent builder that creates an `ILLM` instance with `vi.fn()` spies and call tracking.

#### Prompt matching

```typescript
const llm = mockLLM()
  // String match (substring)
  .onComplete('commit').respondWith('feat: add feature')
  // Regex match
  .onComplete(/explain/i).respondWith('This code does X')
  // Function match
  .onComplete(p => p.length > 100).respondWith('Long prompt handled')
  // Default fallback
  .onAnyComplete().respondWith('default answer');
```

#### Dynamic responses

```typescript
const llm = mockLLM()
  .onAnyComplete().respondWith(prompt => `Echo: ${prompt}`);

// Or return a full LLMResponse object
const llm = mockLLM()
  .onAnyComplete().respondWith({
    content: 'hello',
    model: 'gpt-4',
    usage: { promptTokens: 10, completionTokens: 5 },
  });
```

#### Streaming

```typescript
const llm = mockLLM().streaming(['chunk1', ' ', 'chunk2']);

for await (const chunk of llm.stream('test')) {
  console.log(chunk); // 'chunk1', ' ', 'chunk2'
}
```

#### Error simulation

```typescript
const llm = mockLLM().failing(new Error('rate limit exceeded'));

await llm.complete('test'); // throws Error('rate limit exceeded')
```

#### Tool calling

```typescript
const llm = mockLLM().withToolCalls([
  { id: 'call-1', name: 'search', input: { query: 'test' } },
]);

const res = await llm.chatWithTools!(messages, { tools });
expect(res.toolCalls).toHaveLength(1);
expect(res.toolCalls![0].name).toBe('search');
```

#### Call tracking

```typescript
const llm = mockLLM();
await llm.complete('hello');
await llm.complete('world');

// vi.fn() assertions
expect(llm.complete).toHaveBeenCalledTimes(2);
expect(llm.complete).toHaveBeenCalledWith('hello');

// Structured call history
expect(llm.calls).toHaveLength(2);
expect(llm.calls[0].prompt).toBe('hello');
expect(llm.calls[0].response.content).toBe('mock response');
expect(llm.lastCall?.prompt).toBe('world');

// Tool call history
expect(llm.toolCalls).toHaveLength(0);

// Reset everything
llm.resetCalls();
expect(llm.calls).toHaveLength(0);
expect(llm.complete).not.toHaveBeenCalled();
```

### `mockCache()`

Working in-memory cache with TTL support and sorted sets. All methods are `vi.fn()` spies.

```typescript
const cache = mockCache();

await cache.set('key', { data: 123 }, 5000); // TTL: 5 seconds
const val = await cache.get('key');
expect(val).toEqual({ data: 123 });

// Sorted sets
await cache.zadd('scores', 100, 'alice');
await cache.zadd('scores', 200, 'bob');
const top = await cache.zrangebyscore('scores', 0, 150);
expect(top).toEqual(['alice']);

// Spy assertions
expect(cache.set).toHaveBeenCalledWith('key', { data: 123 }, 5000);

// Direct state access
expect(cache.data.size).toBe(1);

// Reset
cache.reset();
expect(cache.data.size).toBe(0);
```

### `mockStorage()`

Virtual filesystem backed by `Map<string, Buffer>`.

```typescript
// Initialize with files
const storage = mockStorage({
  'config.json': '{"key": "value"}',
  'data.bin': Buffer.from([0x01, 0x02]),
});

const content = await storage.read('config.json');
expect(content).toBe('{"key": "value"}');

await storage.write('new.txt', 'hello');
expect(await storage.exists('new.txt')).toBe(true);

const files = await storage.list('/');
expect(files).toContain('new.txt');

// Direct state access
expect(storage.files.size).toBe(3);
```

### `mockLogger()`

Logger with message recording and `vi.fn()` spies.

```typescript
const logger = mockLogger();

logger.info('Server started', { port: 3000 });
logger.error('Connection failed', new Error('timeout'));
logger.warn('Deprecated API');

// Message history
expect(logger.messages).toHaveLength(3);
expect(logger.messages[0]).toEqual({
  level: 'info',
  message: 'Server started',
  meta: { port: 3000 },
});

// Spy assertions
expect(logger.info).toHaveBeenCalledWith('Server started', { port: 3000 });
expect(logger.error).toHaveBeenCalledWith('Connection failed', expect.any(Error));

// Child loggers share the same messages array
const child = logger.child({ service: 'db' });
child.info('Connected');
expect(logger.messages).toHaveLength(4);
```

### `testCommand(handler, options)`

Single-function test runner for plugin command handlers. No boilerplate — import your handler, call `testCommand()`, assert on result.

Works with any handler type: `CommandHandlerV3` (from `defineCommand`), `RouteHandler` (from `defineRoute`), `Handler` (from `defineHandler`), or any object with `execute(ctx, input)`.

#### CLI command

```typescript
import { testCommand } from '@kb-labs/sdk/testing';
import handler from '../src/commands/greet.js';

it('greets the user', async () => {
  const result = await testCommand(handler, {
    flags: { name: 'Alice' },
  });

  expect(result.exitCode).toBe(0);
  expect(result.result).toEqual({ message: 'Hello, Alice!' });
  expect(result.ui.success).toHaveBeenCalledWith('Hello, Alice!');
  result.cleanup();
});
```

#### With LLM mock

```typescript
import { testCommand, mockLLM } from '@kb-labs/sdk/testing';
import handler from '../src/commands/analyze.js';

it('analyzes file with LLM', async () => {
  const llm = mockLLM().onAnyComplete().respondWith('looks good');

  const result = await testCommand(handler, {
    flags: { file: 'index.ts' },
    platform: { llm },
  });

  expect(result.exitCode).toBe(0);
  expect(llm.complete).toHaveBeenCalled();
  result.cleanup();
});
```

#### REST handler

```typescript
import { testCommand } from '@kb-labs/sdk/testing';
import handler from '../src/routes/create-plan.js';

it('creates a plan', async () => {
  const result = await testCommand(handler, {
    host: 'rest',
    body: { name: 'v2.0' },
    query: { workspace: 'root' },
  });

  expect(result.result).toMatchObject({ name: 'v2.0' });
  result.cleanup();
});
```

#### Raw input (custom shape)

```typescript
const result = await testCommand(handler, {
  input: { custom: 'data', items: [1, 2, 3] },
});
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `flags` | `Record<string, unknown>` | `{}` | CLI flags (builds `{ flags, argv }` input) |
| `argv` | `string[]` | `[]` | CLI positional arguments |
| `query` | `Record<string, unknown>` | — | REST query params (builds `{ query, body, params }` input) |
| `body` | `unknown` | — | REST request body |
| `params` | `Record<string, unknown>` | — | REST route params |
| `input` | `unknown` | — | Raw input (overrides flags/query/body) |
| `host` | `'cli' \| 'rest' \| 'workflow' \| 'webhook'` | `'cli'` | Host type |
| `config` | `TConfig` | `undefined` | Plugin config (`ctx.config`) |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `tenantId` | `string` | `undefined` | Tenant identifier |
| `signal` | `AbortSignal` | `undefined` | Abort signal |
| `platform` | `Partial<PlatformServices>` | all mocks | Override platform services |
| `ui` | `Partial<UIFacade>` | all vi.fn() | Override UI methods |
| `syncSingleton` | `boolean` | `true` | Sync to global singleton |

**Result (`TestCommandResult`):**

| Field | Type | Description |
|-------|------|-------------|
| `exitCode` | `number` | Exit code (0 = success), extracted from `CommandResult` or 0 for raw data |
| `result` | `TResult \| undefined` | Data from `CommandResult.result` or raw return value |
| `meta` | `Record<string, unknown> \| undefined` | Custom metadata from `CommandResult.meta` |
| `raw` | `unknown` | Unprocessed return value from `handler.execute()` |
| `ui` | `UIFacade` | UI facade with `vi.fn()` spies on all methods |
| `ctx` | `PluginContextV3` | Full context passed to the handler |
| `cleanup` | `() => void` | Call in `afterEach()` to reset global singleton |

### `createTestContext(options)`

Enhanced test context factory. Replaces the legacy SDK `createTestContext()`.

```typescript
const { ctx, cleanup } = createTestContext({
  pluginId: 'my-plugin',
  host: 'cli',
  config: { apiKey: 'test' },
  platform: {
    llm: mockLLM().onAnyComplete().respondWith('ok'),
    cache: mockCache(),
  },
});

// ctx.platform has the mocks
await ctx.platform.llm.complete('test');

// Global singleton also has them (syncSingleton defaults to true)
const llm = useLLM();
expect(llm).toBe(ctx.platform.llm);

// UI methods are vi.fn() spies too
ctx.ui.info('hello');
expect(ctx.ui.info).toHaveBeenCalledWith('hello');

// Runtime, API, trace — all mocked
await ctx.runtime.fs.readFile('test.txt');
expect(ctx.runtime.fs.readFile).toHaveBeenCalled();

// ALWAYS call cleanup in afterEach()
cleanup();
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pluginId` | `string` | `'test-plugin'` | Plugin identifier |
| `pluginVersion` | `string` | `'0.0.0'` | Plugin version |
| `host` | `'cli' \| 'rest' \| 'workflow' \| 'webhook'` | `'cli'` | Host type |
| `hostContext` | `HostContext` | auto-generated | Override host context |
| `config` | `unknown` | `undefined` | Plugin config |
| `cwd` | `string` | `process.cwd()` | Working directory |
| `outdir` | `string` | `{cwd}/.kb/output` | Output directory |
| `tenantId` | `string` | `undefined` | Tenant identifier |
| `signal` | `AbortSignal` | `undefined` | Abort signal |
| `platform` | `Partial<PlatformServices>` | all mocks | Override platform adapters |
| `ui` | `Partial<UIFacade>` | all vi.fn() | Override UI methods |
| `syncSingleton` | `boolean` | `true` | Sync to global singleton |

## Architecture

```
@kb-labs/shared-testing
├── setup-platform.ts       ← resetPlatform() + setAdapter() for each mock
├── mock-llm.ts             ← Proxy-based builder + ILLM instance
├── mock-cache.ts           ← In-memory Map with TTL + sorted sets
├── mock-storage.ts         ← Virtual FS on Map<string, Buffer>
├── mock-logger.ts          ← Message recording + child logger support
├── create-test-context.ts  ← PluginContextV3 factory + singleton sync
├── test-command.ts          ← testCommand() — single-function handler runner
└── index.ts                ← Barrel exports

@kb-labs/sdk/testing        ← Thin re-export layer
```

The key insight: `setupTestPlatform()` calls `resetPlatform()` (clears the global singleton) then `platform.setAdapter()` for each provided mock. This ensures `useLLM()`, `useCache()`, etc. return the test mocks. `createTestContext()` calls `setupTestPlatform()` automatically when `syncSingleton: true` (the default).
