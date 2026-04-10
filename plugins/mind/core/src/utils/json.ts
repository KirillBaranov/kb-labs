/**
 * JSON file operations for KB Labs Mind
 */

import { promises as fsp } from "node:fs";
import { dirname } from "node:path";
import { sha256 } from "./hash";

/**
 * Recursively sort object keys for deterministic output
 */
function sortKeysRecursively(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively);
  }

  const sorted: any = {};
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    sorted[key] = sortKeysRecursively(obj[key]);
  }

  return sorted;
}

/**
 * Read JSON file with error handling
 */
export async function readJson<T = any>(filePath: string): Promise<T | null> {
  try {
    const content = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Write JSON file atomically with sorted keys
 */
export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  const tmp = `${filePath}.tmp`;
  const sorted = sortKeysRecursively(data);
  const content = JSON.stringify(sorted, null, 2) + '\n';

  // Ensure directory exists
  await fsp.mkdir(dirname(filePath), { recursive: true });

  // Write to temp file
  await fsp.writeFile(tmp, content, 'utf8');

  // Windows-safe atomic rename
  if (process.platform === "win32") {
    try {
      await fsp.unlink(filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") {throw err;}
    }
  }

  // Rename tmp to final location
  await fsp.rename(tmp, filePath);
}

/**
 * Compute hash of JSON content
 */
export function computeJsonHash(data: any): string {
  const content = JSON.stringify(sortKeysRecursively(data));
  return sha256(content);
}
