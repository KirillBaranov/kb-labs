/**
 * @module @kb-labs/core-sandbox/types/adapter-registry
 * Adapter registry and validation
 */

import type { AdapterMetadata } from './adapter-context';

/**
 * Known adapter types (for type safety, but extensible)
 */
export const ADAPTER_TYPES = {
  CLI: 'cli',
  REST: 'rest',
  WEBHOOK: 'webhook',
  GRAPHQL: 'graphql',
  GRPC: 'grpc',
} as const;

/**
 * Check if adapter type is known
 */
export function isKnownAdapterType(type: string): boolean {
  return Object.values(ADAPTER_TYPES).includes(type as any);
}

/**
 * Validate adapter metadata
 */
export function validateAdapterMetadata(meta: AdapterMetadata): void {
  if (!meta.type) {
    throw new Error('Adapter type is required');
  }
  
  if (!meta.version) {
    throw new Error('Adapter version is required');
  }
  
  // Warn if unknown adapter type
  if (!isKnownAdapterType(meta.type)) {
    console.warn(`Unknown adapter type: ${meta.type}`);
  }
}





