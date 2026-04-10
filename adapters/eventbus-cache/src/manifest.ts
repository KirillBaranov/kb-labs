/**
 * @module @kb-labs/adapters-eventbus-cache/manifest
 * Adapter manifest for Cache-backed EventBus.
 */

import type { AdapterManifest } from '@kb-labs/core-platform';

/**
 * Adapter manifest for Cache-backed EventBus.
 */
export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'eventbus-cache',
  name: 'Cache-backed EventBus',
  version: '1.0.0',
  description: 'EventBus using ICache for persistent event storage with polling-based subscriptions',
  author: 'KB Labs Team',
  license: 'KBPL-1.1',
  type: 'core',
  implements: 'IEventBus',
  requires: {
    adapters: [{ id: 'cache', alias: 'cache' }],
    platform: '>= 1.0.0',
  },
  capabilities: {
    custom: {
      persistence: true,
      distributed: true,
      ttl: true,
      polling: true,
    },
  },
  configSchema: {
    pollIntervalMs: {
      type: 'number',
      default: 1000,
      description: 'Polling interval in milliseconds',
    },
    eventTtlMs: {
      type: 'number',
      default: 86400000,
      description: 'Event TTL in milliseconds (default: 24 hours)',
    },
    keyPrefix: {
      type: 'string',
      default: 'eventbus:',
      description: 'Prefix for all cache keys',
    },
  },
};
