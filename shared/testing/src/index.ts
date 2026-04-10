/**
 * @kb-labs/shared-testing
 *
 * Test utilities for KB Labs plugin development.
 *
 * Provides mock builders, platform setup, and test context factory
 * that solve the singleton gap between ctx.platform and composables.
 *
 * @example
 * ```typescript
 * import {
 *   createTestContext,
 *   setupTestPlatform,
 *   mockLLM,
 *   mockCache,
 *   mockStorage,
 *   mockLogger,
 * } from '@kb-labs/shared-testing';
 * ```
 */

// Platform setup (singleton gap fix)
export {
  setupTestPlatform,
  type TestPlatformOptions,
  type TestPlatformResult,
} from './setup-platform.js';

// Mock builders
export {
  mockLLM,
  type MockLLM,
  type MockLLMInstance,
  type LLMCall,
  type LLMToolCallRecord,
} from './mock-llm.js';

export {
  mockCache,
  type MockCacheInstance,
} from './mock-cache.js';

export {
  mockStorage,
  type MockStorageInstance,
} from './mock-storage.js';

export {
  mockLogger,
  type MockLoggerInstance,
  type LogEntry,
} from './mock-logger.js';

// Test context factory
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
