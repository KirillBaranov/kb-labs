/**
 * @module @kb-labs/plugin-execution/backends/worker-pool
 *
 * Worker pool backend exports.
 */

export { WorkerPoolBackend, type WorkerPoolBackendOptions } from './backend.js';
export { WorkerPool, type PoolEvents } from './pool.js';
export { Worker, type WorkerEvents, type WorkerOptions } from './worker.js';
export type {
  WorkerPoolConfig,
  WorkerState,
  WorkerInfo,
  WorkerPoolStats,
  QueuedRequest,
  WorkerMessage,
  ExecuteMessage,
  ResultMessage,
  ErrorMessage,
  HealthMessage,
  HealthOkMessage,
  ShutdownMessage,
  ReadyMessage,
} from './types.js';
export { DEFAULT_WORKER_POOL_CONFIG } from './types.js';
