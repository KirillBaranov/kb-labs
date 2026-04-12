import type { MindConfig, MindSyncConfig } from '@kb-labs/mind-contracts';
import { defaultMindSyncConfig } from '@kb-labs/mind-contracts';

/**
 * Extract Mind configuration from context
 * Provides type-safe access to mind config with validation
 */
export function useConfig(ctx: { config?: any }): MindConfig {
  if (!ctx.config) {
    throw new Error('Mind configuration not found in context. Ensure ctx.config is loaded.');
  }

  const config = ctx.config as MindConfig;

  // Validate required fields
  if (!config.sources || !Array.isArray(config.sources)) {
    throw new Error('Invalid mind config: missing or invalid sources');
  }

  if (!config.scopes || !Array.isArray(config.scopes)) {
    throw new Error('Invalid mind config: missing or invalid scopes');
  }

  if (!config.engines || !Array.isArray(config.engines)) {
    throw new Error('Invalid mind config: missing or invalid engines');
  }

  return config;
}

/**
 * Try to extract Mind configuration from context
 * Returns null if config is not available or invalid
 */
export function tryUseConfig(ctx: { config?: any }): MindConfig | null {
  try {
    return useConfig(ctx);
  } catch {
    return null;
  }
}

/**
 * Get sync configuration from mind config
 * Returns defaults if sync config is not provided
 */
export function useSyncConfig(ctx: { config?: any }): MindSyncConfig {
  const config = useConfig(ctx);

  if (!config.sync) {
    // Return defaults from contracts
    return { ...defaultMindSyncConfig };
  }

  return config.sync;
}
