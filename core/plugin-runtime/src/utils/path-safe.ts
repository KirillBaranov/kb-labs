/**
 * Path Traversal Protection
 *
 * Prevents '../' escape attacks when resolving artifact paths.
 */

import * as path from 'path';

/**
 * Safely resolve a path within a base directory.
 *
 * Prevents path traversal attacks using '../' sequences.
 *
 * @param basePath - Base directory (e.g., outdir)
 * @param userPath - User-provided path (potentially malicious)
 * @returns Resolved absolute path within basePath
 * @throws Error if resolved path escapes basePath
 *
 * @example
 * ```typescript
 * // Safe
 * resolveSafe('/tmp/out', 'report.txt')  // → '/tmp/out/report.txt'
 * resolveSafe('/tmp/out', 'logs/app.log') // → '/tmp/out/logs/app.log'
 *
 * // Blocked (path traversal attack)
 * resolveSafe('/tmp/out', '../../../etc/passwd') // → throws Error
 * resolveSafe('/tmp/out', 'logs/../../etc/passwd') // → throws Error
 * ```
 */
export function resolveSafe(basePath: string, userPath: string): string {
  // Resolve to absolute path
  const resolvedBase = path.resolve(basePath);
  const resolvedPath = path.resolve(resolvedBase, userPath);

  // Check if resolved path starts with base path
  // Use path.relative to detect if it escapes
  const relative = path.relative(resolvedBase, resolvedPath);

  // If relative path starts with '..' or is outside, it's an escape attempt
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Path traversal detected: '${userPath}' resolves outside base directory '${basePath}'`
    );
  }

  return resolvedPath;
}
