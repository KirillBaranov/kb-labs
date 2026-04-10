/**
 * @module @kb-labs/shared-command-kit/helpers/use-storage
 * Global storage access helper
 *
 * Provides clean access to file/blob storage adapter.
 *
 * @example
 * ```typescript
 * import { useStorage } from '@kb-labs/shared-command-kit';
 *
 * async handler(ctx, argv, flags) {
 *   const storage = useStorage();
 *
 *   if (storage) {
 *     await storage.write('path/to/file.txt', 'content');
 *     const content = await storage.read('path/to/file.txt');
 *   }
 * }
 * ```
 */

import { usePlatform } from './use-platform';
import type { IStorage } from '@kb-labs/core-platform';

/**
 * Access global storage adapter
 *
 * Returns the platform storage adapter for file/blob operations.
 * Returns undefined if storage is not configured (graceful degradation).
 *
 * **Methods:**
 * - `storage.read(path)` - Read file content
 * - `storage.write(path, content)` - Write file content
 * - `storage.exists(path)` - Check if file exists
 * - `storage.delete(path)` - Delete file
 * - `storage.list(prefix?)` - List files
 *
 * **Always check availability:**
 * ```typescript
 * const storage = useStorage();
 * if (storage) {
 *   await storage.write('file.txt', 'content');
 * }
 * ```
 *
 * @returns Storage adapter or undefined if not configured
 *
 * @example
 * ```typescript
 * const storage = useStorage();
 *
 * if (storage) {
 *   // Write file
 *   await storage.write('releases/v1.0.0.json', JSON.stringify(data));
 *
 *   // Read file
 *   const content = await storage.read('releases/v1.0.0.json');
 *   const data = JSON.parse(content);
 *
 *   // Check existence
 *   const exists = await storage.exists('releases/v1.0.0.json');
 *
 *   // List files
 *   const files = await storage.list('releases/');
 * }
 * ```
 */
export function useStorage(): IStorage | undefined {
  const platform = usePlatform();
  return platform.storage;
}
