/**
 * @kb-labs/sdk/testing
 *
 * Test utilities for KB Labs plugin development.
 * Re-exports from @kb-labs/shared-testing (pure mocks) and
 * @kb-labs/shared-testing-platform (platform setup + context factory).
 *
 * @example
 * ```typescript
 * import { createTestContext, mockLLM, mockCache } from '@kb-labs/sdk/testing';
 *
 * const llm = mockLLM().onAnyComplete().respondWith('hello');
 * const { ctx, cleanup } = createTestContext({ platform: { llm } });
 *
 * // Both ctx.platform.llm and useLLM() return the same mock
 * await handler.execute(ctx, args);
 * expect(llm.complete).toHaveBeenCalled();
 *
 * cleanup(); // Reset singleton in afterEach
 * ```
 */

// Pure mocks (no core-runtime dependency)
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

// Platform setup + context factory (requires core-runtime)
export {
  setupTestPlatform,
  type TestPlatformOptions,
  type TestPlatformResult,
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
  testCommand,
  type TestableHandler,
  type TestCommandOptions,
  type TestCommandResult,
} from '@kb-labs/shared-testing-platform';

// In-memory storage implementations (IDocumentDatabase / IKVStore)
export {
  InMemoryDocumentDatabase,
  createInMemoryDocumentDatabase,
  type InMemoryDocumentDatabaseOptions,
  InMemoryKVStore,
  createInMemoryKVStore,
} from '@kb-labs/shared-testing-platform';

// Tool mock builder
export {
  mockTool,
  type MockToolInstance,
} from '@kb-labs/shared-tool-kit/testing';

// CLI handler test helpers (requires vitest)
export {
  mockCLIInput,
  type MockCLIInputOptions,
  mockObject,
  createCapturedUI,
  type UICapture,
  type CapturedUI,
  createMockContext,
  type MockContextOptions,
} from '@kb-labs/shared-testing-e2e/cli';
