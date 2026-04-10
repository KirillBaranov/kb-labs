/**
 * Directory creation utilities for KB Labs Mind Indexer
 */

import { promises as fsp } from "node:fs";
import path from "node:path";

/**
 * Ensure directory exists (mkdirp)
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Ensure .kb/mind directory structure exists
 */
export async function ensureMindStructure(cwd: string): Promise<string> {
  const mindDir = path.join(cwd, '.kb', 'mind');
  const packsDir = path.join(mindDir, 'packs');
  
  await ensureDir(mindDir);
  await ensureDir(packsDir);
  
  return mindDir;
}
