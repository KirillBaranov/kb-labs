/**
 * Platform module — adapter pipeline and governance.
 */

export { createGovernedPlatformServices, applyPluginGovernance } from './governed.js';
export { assemblePlatform, applyPluginGovernance as applyGovernance } from './pipeline.js';
export type { PlatformConfig, LoadedMiddleware } from './pipeline.js';
export { ADAPTER_REGISTRY } from './adapter-registry.js';
export type { AdapterRegistryKey } from './adapter-registry.js';
export {
  PIPELINE_SLOTS,
  SLOT_ORDER,
  validateMiddlewareDecl,
} from './pipeline-slots.js';
export type { SlotName, SlotDef, SystemStageName, AdapterMiddlewareDecl } from './pipeline-slots.js';
export type { AdapterMiddlewareFn, MiddlewareContext, AdapterLifecycle, GovernanceDef, IPCDef, AdapterDescriptor } from './middleware.js';
export {
  wrapDocumentDatabase,
  wrapKVStore,
  validateDatabaseGrants,
} from './database-governance.js';
export type { ManifestForGrantValidation } from './database-governance.js';
