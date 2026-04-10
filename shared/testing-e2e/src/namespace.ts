import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';

/**
 * Build a deterministic-yet-unique namespace prefix for e2e test resources.
 *
 * Shape: `e2e-<fileHash>-<nanoid>`
 *
 * - `fileHash` is 6 hex chars of sha1(filePath) — lets you grep leaked resources
 *   back to the test file that created them.
 * - `nanoid` is a 10-char random suffix — lets parallel runs never collide.
 *
 * Pass `import.meta.url` from the test file.
 */
export function makeTestNamespace(fileUrlOrPath: string, prefix = 'e2e'): string {
  const hash = createHash('sha1').update(fileUrlOrPath).digest('hex').slice(0, 6);
  return `${prefix}-${hash}-${nanoid(10)}`;
}
