#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/**
 * Synchronously reads tsup.external.json and returns the externals array.
 * Searches up the directory tree to find the file (similar to tsconfig.paths.json).
 * This is a synchronous version for use in tsup.config.ts files.
 *
 * @param {string} [cwd] - Current working directory (defaults to process.cwd())
 * @returns {string[]} Array of external package names
 */
export function readTsupExternalSync(cwd = process.cwd()) {
  // Search up the directory tree for tsup.external.json
  // Limit search to prevent infinite loops
  let current = resolve(cwd);
  let prev = null;
  let depth = 0;
  const maxDepth = 20; // Safety limit

  while (current !== prev && depth < maxDepth) {
    const externalPath = join(current, 'tsup.external.json');
    if (existsSync(externalPath)) {
      try {
        const content = readFileSync(externalPath, 'utf8');
        const data = JSON.parse(content);
        return Array.isArray(data.externals) ? data.externals : [];
      } catch {
        // If file is invalid, continue searching up
      }
    }
    prev = current;
    current = dirname(current);
    depth++;
  }

  // If file not found, return empty array
  return [];
}

