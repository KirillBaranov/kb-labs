/**
 * @kb-labs/mind-indexer
 * Delta indexing for KB Labs Mind
 */

// API
export { initMindStructure } from './api/init';
export { updateIndexes } from './api/update';

// Types
export type { UpdateOptions, DeltaReport, InitOptions, CacheEntry, IndexerContext, IExportExtractor } from './types/index';

// Utils
export { createIndexerContext, isTimeBudgetExceeded, getRemainingTime } from './utils/workspace';
export type { ExistingIndexes } from './utils/workspace';

// FS
export { readJson, writeJson, computeJsonHash } from './fs/json';
export { ensureDir, ensureMindStructure } from './fs/ensure';

// Cache
export { LRUCache, FileCache } from './cache/lru';

// Adapters
export { TSExtractor } from './adapters/ts-extractor';
