/**
 * @module @kb-labs/rest-api-app/utils/repo
 * Repository utilities
 */

import * as path from 'node:path';
import { promises as fs } from 'node:fs';

/**
 * Find monorepo root (prefer pnpm-workspace.yaml or .git over package.json)
 */
export async function findMonorepoRoot(startDir: string): Promise<string> {
  let dir = path.resolve(startDir);
  let foundRoot: string | null = null;
  
  while (true) {
    try {
      const hasGit = await fs.access(path.join(dir, '.git')).then(() => true).catch(() => false);
      const hasWorkspace = await fs.access(path.join(dir, 'pnpm-workspace.yaml')).then(() => true).catch(() => false);
      
      if (hasGit && hasWorkspace) {
        foundRoot = dir;
      }
    } catch {
      // Continue
    }
    
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  
  if (foundRoot) {
    return foundRoot;
  }
  
  // Fallback: use startDir
  return path.resolve(startDir);
}

