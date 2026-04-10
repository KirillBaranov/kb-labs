/**
 * @kb-labs/sdk/testing
 *
 * Test utilities for KB Labs plugin development.
 * Re-exports from @kb-labs/shared-testing.
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

export {
  // Platform setup
  setupTestPlatform,
  type TestPlatformOptions,
  type TestPlatformResult,

  // Mock builders
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

  // Context factory
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

  // Command test runner
  testCommand,
  type TestableHandler,
  type TestCommandOptions,
  type TestCommandResult,
} from '@kb-labs/shared-testing';

// Tool mock builder
export {
  mockTool,
  type MockToolInstance,
} from '@kb-labs/shared-tool-kit/testing';
