/**
 * Registry configuration for Mind sync
 */
export interface MindSyncRegistryConfig {
  type: 'filesystem';
  path: string;
}

/**
 * Soft delete configuration for Mind sync
 */
export interface MindSyncSoftDeleteConfig {
  enabled: boolean;
  ttlDays: number;
}

/**
 * Partial updates configuration for Mind sync
 */
export interface MindSyncPartialUpdatesConfig {
  enabled: boolean;
}

/**
 * Batch processing configuration for Mind sync
 */
export interface MindSyncBatchConfig {
  maxSize: number;
}

/**
 * Mind synchronization configuration
 */
export interface MindSyncConfig {
  registry: MindSyncRegistryConfig;
  softDelete: MindSyncSoftDeleteConfig;
  partialUpdates: MindSyncPartialUpdatesConfig;
  batch: MindSyncBatchConfig;
}

/**
 * Mind source configuration
 */
export interface MindSourceConfig {
  id: string;
  paths: string[];
  exclude?: string[];
}

/**
 * Mind engine configuration
 */
export interface MindEngineConfig {
  id: string;
  type: string;
  options?: Record<string, unknown>;
}

/**
 * Mind scope configuration
 */
export interface MindScopeConfig {
  id: string;
  sourceIds?: string[];
  defaultEngine?: string;
  include?: string[];
  exclude?: string[];
}

/**
 * Mind defaults configuration
 */
export interface MindDefaultsConfig {
  fallbackEngineId?: string;
}

/**
 * Canonical Mind configuration input
 */
export interface MindConfigInput {
  sources: MindSourceConfig[];
  scopes: MindScopeConfig[];
  engines: MindEngineConfig[];
  defaults?: MindDefaultsConfig;
}

/**
 * Mind configuration with sync section
 */
export interface MindConfig extends MindConfigInput {
  /**
   * Synchronization settings for Mind
   */
  sync?: MindSyncConfig;
}

/**
 * Default sync configuration
 */
export const defaultMindSyncConfig: MindSyncConfig = {
  registry: {
    type: 'filesystem',
    path: '.kb/mind/sync/registry.json',
  },
  softDelete: {
    enabled: true,
    ttlDays: 30,
  },
  partialUpdates: {
    enabled: true,
  },
  batch: {
    maxSize: 100,
  },
};
