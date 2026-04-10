/**
 * Hashing utilities for KB Labs Mind
 */

import { createHash } from 'node:crypto';

/**
 * Compute SHA256 hash for string content
 */
export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Compute SHA256 hash for Buffer content
 */
export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Compute SHA256 hash for file content (streaming for large files)
 */
export async function sha256File(filePath: string): Promise<string> {
  const { readFile } = await import('node:fs/promises');
  const content = await readFile(filePath);
  return sha256Buffer(content);
}
