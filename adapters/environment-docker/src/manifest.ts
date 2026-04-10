/**
 * @module @kb-labs/adapters-environment-docker/manifest
 * Adapter manifest for Docker-based environment provider.
 */

import type { AdapterManifest } from '@kb-labs/core-platform';

/**
 * Adapter manifest for Docker environment provider.
 */
export const manifest: AdapterManifest = {
  manifestVersion: '1.0.0',
  id: 'docker-environment-provider',
  name: 'Docker Environment Provider',
  version: '0.1.0',
  description: 'Long-lived environment provider using local Docker CLI',
  author: 'KB Labs Team',
  license: 'KBPL-1.1',
  type: 'core',
  implements: 'IEnvironmentProvider',
  contexts: ['workspace'],
  capabilities: {
    custom: {
      docker: true,
      leaseRenewal: true,
      longLivedEnvironments: true,
    },
  },
  configSchema: {
    dockerBinary: {
      type: 'string',
      default: 'docker',
      description: 'Path to Docker CLI binary',
    },
    defaultImage: {
      type: 'string',
      default: 'node:20-alpine',
      description: 'Default image used for created environments',
    },
    network: {
      type: 'string',
      description: 'Optional Docker network for created containers',
    },
    autoRemove: {
      type: 'boolean',
      default: true,
      description: 'Use --rm for containers',
    },
    defaultTtlMs: {
      type: 'number',
      default: 3600000,
      description: 'Default environment lease TTL in milliseconds',
    },
    mountWorkspace: {
      type: 'boolean',
      default: true,
      description: 'Mount workspace path into container',
    },
    workspaceMountPath: {
      type: 'string',
      default: '/workspace',
      description: 'Container path used for workspace mount',
    },
  },
};
