import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import globby from 'globby';

export { findRepoRoot } from '@kb-labs/sdk';

/**
 * Converts scope to safe directory name
 */
export function scopeToDir(scope: string): string {
  return scope
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/:/g, '-')
    .replace(/\*/g, '');
}

/**
 * Converts safe directory name back to scope
 */
export function dirToScope(dirName: string): string {
  if (dirName === 'root') {
    return 'root';
  }

  const parts = dirName.split('-');
  if (parts.length >= 2) {
    return '@' + parts[0] + '-' + parts[1] + '/' + parts.slice(2).join('-');
  }

  return dirName;
}

/**
 * Resolve scope name to absolute filesystem path.
 * Scans all package.json in repoRoot to find the matching package by name.
 */
export async function resolveScopePath(repoRoot: string, scope: string): Promise<string> {
  if (scope === 'root') {
    return repoRoot;
  }

  if (scope.startsWith('@')) {
    const packageJsonPaths = await globby('**/package.json', {
      cwd: repoRoot,
      absolute: true,
      onlyFiles: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/.*/**'],
    });

    for (const pkgJsonPath of packageJsonPaths) {
      try {
        const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
        if (pkg.name === scope) {
          return join(pkgJsonPath, '..');
        }
      } catch { /* skip */ }
    }
  }

  // Direct path or fallback
  return join(repoRoot, scope);
}
