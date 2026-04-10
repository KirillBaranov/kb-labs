import type { WorkspacePackage, QAPluginConfig } from '@kb-labs/qa-contracts';

/**
 * Match a package name against a pattern.
 * Supports: exact match, glob with trailing * (e.g., "@kb-labs/core-*"), repo prefix ("kb-labs-cli/*").
 */
function matchesPattern(packageName: string, repo: string, pattern: string): boolean {
  // Repo prefix pattern: "kb-labs-cli/*" matches all packages in that repo
  if (pattern.includes('/') && pattern.endsWith('/*')) {
    const repoPrefix = pattern.slice(0, -2);
    return repo === repoPrefix;
  }

  // Exact match
  if (!pattern.includes('*')) {
    return packageName === pattern;
  }

  // Glob with trailing *: "@kb-labs/core-*" matches "@kb-labs/core-types", "@kb-labs/core-sys", etc.
  const prefix = pattern.slice(0, pattern.indexOf('*'));
  return packageName.startsWith(prefix);
}

/**
 * Resolve which categories each package belongs to.
 * Returns a Map of packageName → categoryName[].
 *
 * A package can belong to multiple categories (e.g., a repo listed in both "core" and "hosts").
 * If no config or no categories defined, all packages map to ['uncategorized'].
 * Packages that don't match any category go to ['uncategorized'].
 */
export function resolveCategories(
  packages: WorkspacePackage[],
  config?: QAPluginConfig,
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  if (!config?.categories) {
    for (const pkg of packages) {
      map.set(pkg.name, ['uncategorized']);
    }
    return map;
  }

  const categoryEntries = Object.entries(config.categories);

  for (const pkg of packages) {
    const matched: string[] = [];
    for (const [categoryKey, categoryConfig] of categoryEntries) {
      for (const pattern of categoryConfig.packages) {
        if (matchesPattern(pkg.name, pkg.repo, pattern)) {
          matched.push(categoryKey);
          break; // Don't match same category twice for same package
        }
      }
    }
    map.set(pkg.name, matched.length > 0 ? matched : ['uncategorized']);
  }

  return map;
}
