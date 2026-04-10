/**
 * @module @kb-labs/plugin-execution/backends
 */

export { InProcessBackend, type InProcessBackendOptions } from './in-process.js';
export { SubprocessBackend, type SubprocessBackendOptions } from './subprocess.js';
export { WorkerPoolBackend, type WorkerPoolBackendOptions } from './worker-pool/backend.js';
