/**
 * @module @kb-labs/mind-engine/sync/registry/registry-factory
 * Factory for creating document registry instances
 */

import type { RegistryConfig } from '../types';
import type { DocumentRegistry } from './document-registry';
import { FileSystemRegistry } from './filesystem-registry';

/**
 * Create a document registry based on configuration
 */
export function createRegistry(config: RegistryConfig): DocumentRegistry {
  const type = config.type ?? 'filesystem';

  switch (type) {
    case 'filesystem': {
      const path = config.path ?? '.kb/mind/sync/registry.json';
      return new FileSystemRegistry({
        path,
        backup: config.backup ?? true,
        backupRetention: config.backupRetention ?? 7,
      });
    }

    case 'database':
      // Future: implement database registry
      throw new Error('Database registry not implemented yet. Use filesystem registry.');

    default:
      throw new Error(`Unknown registry type: ${type}`);
  }
}



