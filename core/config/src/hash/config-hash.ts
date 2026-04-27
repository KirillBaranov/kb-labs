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
export function computeConfigHash(obj: unknown): string {
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
function normalizeForHash(obj: unknown): unknown {
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
  const record = obj as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const normalized: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const value = record[key];
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
export function computeConfigsHash(configs: Record<string, unknown>[]): string {
  const combined = configs.reduce<Record<string, unknown>>((acc, config) => {
    return { ...acc, ...config };
  }, {});
  return computeConfigHash(combined);
}
