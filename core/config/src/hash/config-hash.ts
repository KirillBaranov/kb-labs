/**
 * @module @kb-labs/core/config/hash/config-hash
 * SHA256 hash computation for configuration objects (lockfile generation)
 */

import { createHash } from 'node:crypto';

/**
 * Compute SHA256 hash of a configuration object
 * @param obj Configuration object to hash
 * @returns SHA256 hash as hex string
 */
export function computeConfigHash(obj: any): string {
  // Normalize object for consistent hashing
  const normalized = normalizeForHash(obj);
  const json = JSON.stringify(normalized, null, 0);
  return createHash('sha256').update(json, 'utf8').digest('hex');
}

/**
 * Normalize object for consistent hashing
 * - Sort object keys
 * - Remove undefined values
 * - Convert to stable representation
 */
function normalizeForHash(obj: any): any {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(normalizeForHash);
  }
  
  // Sort object keys for consistent ordering
  const sortedKeys = Object.keys(obj).sort();
  const normalized: any = {};
  
  for (const key of sortedKeys) {
    const value = obj[key];
    if (value !== undefined) {
      normalized[key] = normalizeForHash(value);
    }
  }
  
  return normalized;
}

/**
 * Compute hash for multiple config objects
 * @param configs Array of config objects
 * @returns Combined SHA256 hash
 */
export function computeConfigsHash(configs: any[]): string {
  const combined = configs.reduce((acc, config) => {
    return { ...acc, ...config };
  }, {});
  return computeConfigHash(combined);
}
