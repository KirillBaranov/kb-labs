/**
 * Path utilities for KB Labs Mind
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

/**
 * Convert path to POSIX format (forward slashes)
 */
export function toPosix(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

/**
 * Convert POSIX path back to platform-specific format
 */
export function fromPosix(posixPath: string): string {
  return posixPath.split('/').join(path.sep);
}

/**
 * Find workspace root by looking for git repository or monorepo indicators
 * Searches up the directory tree from cwd
 */
export async function findWorkspaceRoot(cwd: string): Promise<string> {
  let current = path.resolve(cwd);
  const root = path.parse(current).root;

  while (current !== root) {
    // Check for git repository
    if (existsSync(path.join(current, '.git'))) {
      return toPosix(current);
    }

    // Check for monorepo indicators
    const packageJsonPath = path.join(current, 'package.json');
    if (existsSync(packageJsonPath)) {
      try {
        const packageJsonContent = await readFile(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent);
        // Check for workspace configuration
        if (packageJson.workspaces || packageJson.pnpm?.workspace) {
          return toPosix(current);
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Check for pnpm-workspace.yaml
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return toPosix(current);
    }

    // Move up one directory
    current = path.dirname(current);
  }

  // If no workspace found, return the original cwd as POSIX
  return toPosix(cwd);
}

/**
 * Make path relative to workspace root
 */
export function makeRelativeToRoot(absolutePath: string, root: string): string {
  const relative = path.relative(root, absolutePath);
  return toPosix(relative);
}

/**
 * Check if path should be ignored based on common patterns
 */
export function shouldIgnorePath(filePath: string): boolean {
  const posixPath = toPosix(filePath);
  
  const ignorePatterns = [
    'node_modules/**',
    '.git/**',
    '.kb/**', // except .kb/mind/**
    'dist/**',
    'coverage/**',
    '.turbo/**',
    '.vite/**',
    '**/*.log',
    '**/*.tmp',
    '**/*.temp'
  ];
  
  // Simple file extension patterns
  const extensionPatterns = ['.log', '.tmp', '.temp'];

  // Special case: allow .kb/mind/** but ignore other .kb/**
  if (posixPath.startsWith('.kb/') && !posixPath.startsWith('.kb/mind/')) {
    return true;
  }
  
  // Allow .kb/mind/** paths
  if (posixPath.startsWith('.kb/mind/')) {
    return false;
  }
  
  // Check simple extension patterns first
  if (extensionPatterns.some(ext => posixPath.endsWith(ext))) {
    return true;
  }

  return ignorePatterns.some(pattern => {
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3);
      return posixPath.startsWith(prefix + '/') || posixPath === prefix;
    }
    if (pattern.endsWith('**')) {
      const prefix = pattern.slice(0, -2);
      return posixPath.startsWith(prefix);
    }
    if (pattern.startsWith('**/')) {
      const suffix = pattern.slice(3);
      return posixPath.endsWith(suffix);
    }
    if (pattern.includes('*')) {
      // Simple glob pattern matching
      let regexPattern = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
      // Handle **/*.ext patterns that should match files in any directory
      if (pattern.startsWith('**/')) {
        regexPattern = '.*' + regexPattern.slice(3);
      }
      const regex = new RegExp('^' + regexPattern + '$');
      return regex.test(posixPath);
    }
    return posixPath.includes(pattern);
  });
}
