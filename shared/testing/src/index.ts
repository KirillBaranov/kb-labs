/**
 * @kb-labs/shared-testing
 *
 * Pure mock builders for KB Labs plugin development.
 * Only depends on @kb-labs/core-platform interfaces (Layer 0).
 *
 * For platform setup utilities (createTestContext, testCommand, setupTestPlatform)
 * that require @kb-labs/core-runtime, use @kb-labs/shared-testing-platform.
 *
 * @example
 * ```typescript
 * import { mockLLM, mockCache, mockStorage, mockLogger } from '@kb-labs/shared-testing';
 * ```
 */

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

export { MockEmbeddings } from './mock-embeddings.js';
