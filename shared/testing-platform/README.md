# @kb-labs/shared-testing-platform

Platform setup utilities for testing KB Labs plugins.

Requires `@kb-labs/core-runtime` (concrete implementation). For pure mocks only, use `@kb-labs/shared-testing`.

## Usage

```typescript
import { createTestContext, testCommand, mockLLM } from '@kb-labs/sdk/testing';

const llm = mockLLM().onAnyComplete().respondWith('hello');
const { ctx, cleanup } = createTestContext({ platform: { llm } });
```

## Exports

- `setupTestPlatform` — sets test mocks into the global platform singleton
- `createTestContext` — factory for `PluginContextV3` with injected mocks
- `testCommand` — single-function runner for plugin command handlers
