/**
 * @module @kb-labs/core/config/utils/fs-atomic
 * Atomic file write operations using tmp+rename pattern
 */

import { promises as fs } from 'node:fs';
import { resolve } from 'node:path';
import { KbError } from '../errors/kb-error';
import { dirname } from 'node:path';

/**
 * Write file atomically using tmp+rename pattern
 * This ensures that the file is never partially written in case of crashes
 */
export async function writeFileAtomic(
  path: string,
  data: string | Uint8Array
): Promise<void> {
  const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  try {
    // Ensure parent directory exists
    await fs.mkdir(dirname(path), { recursive: true });
    await fs.mkdir(dirname(tmp), { recursive: true });
    
    // Write to temp file
    await fs.writeFile(tmp, data);
    
    // Atomic rename
    await fs.rename(tmp, path);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await fs.unlink(tmp);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Ensure a path is within the workspace root
 * Throws ERR_PATH_OUTSIDE_WORKSPACE if the path escapes the workspace
 */
export function ensureWithinWorkspace(targetPath: string, workspaceRoot: string): void {
  const absTarget = resolve(targetPath);
  const absRoot = resolve(workspaceRoot);
  
  if (!absTarget.startsWith(absRoot)) {
    throw new KbError(
      'ERR_PATH_OUTSIDE_WORKSPACE',
      `Refusing to write outside workspace: ${targetPath}`,
      'Check cwd or use a relative path within the workspace',
      { targetPath, workspaceRoot }
    );
  }
}

