import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PATHS } from '@kb-labs/qa-contracts';

interface CacheEntry {
  hash: string;
  timestamp: string;
}

export type PackageCache = Record<string, CacheEntry>;

/**
 * Load package hash cache from disk.
 */
export function loadCache(rootDir: string): PackageCache {
  const cachePath = join(rootDir, PATHS.CACHE);
  if (!existsSync(cachePath)) {return {};}
  try {
    return JSON.parse(readFileSync(cachePath, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Save package hash cache to disk.
 */
export function saveCache(rootDir: string, cache: PackageCache): void {
  const cachePath = join(rootDir, PATHS.CACHE);
  const dir = dirname(cachePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

/**
 * Compute SHA256 hash for a package based on its source files and package.json.
 */
export function computePackageHash(pkgDir: string): string {
  const hash = createHash('sha256');

  // Hash package.json
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (existsSync(pkgJsonPath)) {
    hash.update(readFileSync(pkgJsonPath));
  }

  // Hash all files in src/
  const srcDir = join(pkgDir, 'src');
  if (existsSync(srcDir)) {
    hashDirectory(srcDir, hash);
  }

  return hash.digest('hex');
}

function hashDirectory(dir: string, hash: ReturnType<typeof createHash>): void {
  const entries = readdirSync(dir).sort();
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      hashDirectory(fullPath, hash);
    } else if (stat.isFile()) {
      hash.update(fullPath);
      hash.update(readFileSync(fullPath));
    }
  }
}

/**
 * Check if a package has changed since last cached hash.
 */
export function hasPackageChanged(pkgDir: string, pkgName: string, cache: PackageCache): boolean {
  const currentHash = computePackageHash(pkgDir);
  const cached = cache[pkgName];
  if (!cached) {return true;}
  return cached.hash !== currentHash;
}

/**
 * Update cache entry for a package.
 */
export function updateCacheEntry(pkgDir: string, pkgName: string, cache: PackageCache): PackageCache {
  const hash = computePackageHash(pkgDir);
  return {
    ...cache,
    [pkgName]: { hash, timestamp: new Date().toISOString() },
  };
}
