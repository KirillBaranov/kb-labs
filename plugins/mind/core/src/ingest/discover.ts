/**
 * File discovery over the platform `IStorage` adapter.
 *
 * `scope` is treated as a path prefix (default: everything). Only text-like
 * source/doc/config files are indexed; binary and dependency dirs are skipped.
 */

import type { IStorage } from '../services';

const INDEXABLE = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb|md|mdx|txt|json|ya?ml|toml)$/i;
const SKIP = /(^|\/)(node_modules|dist|build|\.git|coverage|\.kb)(\/|$)/;

export function isIndexable(path: string): boolean {
  return INDEXABLE.test(path) && !SKIP.test(path);
}

export async function discover(storage: IStorage, scope?: string): Promise<string[]> {
  const prefix = scope && scope !== '.' ? scope : '';
  const paths = await storage.list(prefix);
  return paths.filter(isIndexable);
}
