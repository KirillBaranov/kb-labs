/**
 * @module @kb-labs/quality-core
 * Core business logic for KB Labs Quality Plugin
 *
 * Atomic, reusable functions for monorepo analysis.
 * No CLI or REST logic - pure computation only.
 */

export * from './graph/index.js';
export * from './stats/index.js';
export * from './health/index.js';
export * from './dependencies/index.js';
export * from './builds/index.js';
export * from './types/index.js';
export * from './tests/index.js';
export * from './dead-code/index.js';
