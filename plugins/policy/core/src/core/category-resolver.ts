import type { CategoryResult, PolicyConfig } from '@kb-labs/policy-contracts';

/**
 * Checks if a repo path matches a glob-like category path pattern.
 * Supports simple wildcards: "plugins/*" matches "plugins/kb-labs-mind".
 */
function matchesPattern(repoPath: string, pattern: string): boolean {
  // Normalize trailing slashes
  const normalizedPath = repoPath.replace(/\/$/, '');
  const normalizedPattern = pattern.replace(/\/$/, '');

  if (normalizedPattern === normalizedPath) {return true;}

  // Handle wildcard: "plugins/*" → matches "plugins/anything"
  if (normalizedPattern.endsWith('/*')) {
    const prefix = normalizedPattern.slice(0, -2); // remove /*
    const pathPrefix = normalizedPath.split('/').slice(0, prefix.split('/').length).join('/');
    return pathPrefix === prefix;
  }

  // Exact prefix match with single segment after
  if (normalizedPattern.includes('*')) {
    const regexStr = normalizedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]+');
    return new RegExp(`^${regexStr}$`).test(normalizedPath);
  }

  return false;
}

/**
 * Detects the category for a given repo path based on the policies config.
 * Returns first matching category. If no match, returns category: null.
 */
export function detectCategory(repoPath: string, config: PolicyConfig): CategoryResult {
  for (const [categoryName, categoryConfig] of Object.entries(config.categories)) {
    for (const pattern of categoryConfig.paths) {
      if (matchesPattern(repoPath, pattern)) {
        return {
          path: repoPath,
          category: categoryName,
          rules: categoryConfig.rules,
        };
      }
    }
  }

  return {
    path: repoPath,
    category: null,
    rules: ['boundary-check'], // default fallback rule
  };
}

/**
 * Detects categories for multiple repo paths.
 */
export function detectCategories(repoPaths: string[], config: PolicyConfig): CategoryResult[] {
  return repoPaths.map((p) => detectCategory(p, config));
}
