/**
 * @kb-labs/shared-testing-platform
 *
 * Platform setup utilities for testing KB Labs plugins.
 * Depends on @kb-labs/core-runtime (concrete implementation).
 *
 * For pure mocks (mockLLM, mockLogger, etc.) that only need core-platform
 * interfaces, use @kb-labs/shared-testing instead.
 *
 * @example
 * ```typescript
 * import { createTestContext, mockLLM } from '@kb-labs/shared-testing-platform';
 *
 * const llm = mockLLM().onAnyComplete().respondWith('hello');
 * const { ctx, cleanup } = createTestContext({ platform: { llm } });
 * ```
 */

// Platform setup (requires core-runtime)
export {
  setupTestPlatform,
  type TestPlatformOptions,
  type TestPlatformResult,
} from './setup-platform.js';

// Test context factory + mock factories
export {
  createTestContext,
  createMockPluginContextV3,
  createMockPlatformApi,
  createMockPluginAPI,
  createMockEnvironmentAPI,
  createMockWorkspaceAPI,
  createMockSnapshotAPI,
  createInfraApiMocks,
  createMockRuntime,
  createMockUI,
  createMockTrace,
  type CreateTestContextOptions,
  type TestContextResult,
} from './create-test-context.js';

// Command test runner
export {
  testCommand,
  type TestableHandler,
  type TestCommandOptions,
  type TestCommandResult,
} from './test-command.js';

// In-memory storage implementations for tests (IDocumentDatabase / IKVStore)
export {
  InMemoryDocumentDatabase,
  createInMemoryDocumentDatabase,
  type InMemoryDocumentDatabaseOptions,
} from './in-memory-document-database.js';

export {
  InMemoryKVStore,
  createInMemoryKVStore,
} from './in-memory-kv-store.js';

// Re-export pure mocks for convenience (consumers can use one import)
export {
  mockLLM,
  type MockLLM,
  type MockLLMInstance,
  type LLMCall,
  type LLMToolCallRecord,
  mockCache,
  type MockCacheInstance,
  mockStorage,
  type MockStorageInstance,
  mockLogger,
  type MockLoggerInstance,
  type LogEntry,
} from '@kb-labs/shared-testing';
