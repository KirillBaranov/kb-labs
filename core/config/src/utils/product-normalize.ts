/**
 * @module @kb-labs/core/config/utils/product-normalize
 * Product ID normalization between code (camelCase) and filesystem (kebab-case)
 */

const FS_MAP = new Map([
  ['aiReview', 'ai-review'],
  ['aiDocs', 'ai-docs'],
  ['devlink', 'devlink'],
  ['release', 'release'],
  ['devkit', 'devkit'],
  ['mind', 'mind'],
  ['workflow', 'workflow'],
  ['analytics', 'analytics'],
]);

/**
 * Convert product ID to filesystem kebab-case format
 * @param id Product ID (e.g., 'aiReview', 'mind', 'workflow')
 * @returns kebab-case string for filesystem paths
 */
export function toFsProduct(id: string): string {
  return FS_MAP.get(id) ?? id;
}

/**
 * Convert filesystem kebab-case key to product ID
 * @param fsKey kebab-case string from filesystem
 * @returns Product ID (camelCase if mapped, original otherwise)
 */
export function toConfigProduct(fsKey: string): string {
  for (const [k, v] of FS_MAP) {
    if (v === fsKey) {return k;}
  }
  return fsKey;
}

/**
 * Check if a string is a known product ID
 */
export function isValidProductId(value: string): boolean {
  return FS_MAP.has(value);
}

/**
 * Get all known product IDs
 */
export function getAllProductIds(): string[] {
  return Array.from(FS_MAP.keys());
}
