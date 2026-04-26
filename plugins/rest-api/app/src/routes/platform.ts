/**
 * @module @kb-labs/rest-api-app/routes/platform
 * Platform configuration endpoints
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { PlatformConfigResponse, PlatformConfigPayload } from '@kb-labs/rest-api-contracts';
import { normalizeBasePath, resolvePaths } from '../utils/path-helpers';
import { readKbConfig } from '@kb-labs/core-config';
import { platform } from '@kb-labs/core-runtime';
import { restDomainOperationMetrics } from '../middleware/metrics.js';

/**
 * Sensitive keys to redact from adapterOptions
 */
const SENSITIVE_KEYS = [
  'apiKey',
  'secret',
  'password',
  'token',
  'key',
  'credentials',
  'auth',
];

/**
 * Recursively redact sensitive keys from an object
 */
function redactSensitiveData(
  obj: Record<string, any>,
  redacted: string[] = [],
  path: string = ''
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    const lowerKey = key.toLowerCase();

    // Check if key contains sensitive patterns
    const isSensitive = SENSITIVE_KEYS.some(pattern => lowerKey.includes(pattern.toLowerCase()));

    if (isSensitive && typeof value === 'string') {
      result[key] = '***REDACTED***';
      redacted.push(currentPath);
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitiveData(value, redacted, currentPath);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Load platform configuration from kb.config.json using core-config utilities
 */
async function loadPlatformConfig(repoRoot: string): Promise<{
  adapters: Record<string, string | null>;
  adapterOptions: Record<string, unknown>;
  execution: { mode: string };
}> {
  try {
    const configResult = await readKbConfig(repoRoot);

    if (!configResult || !configResult.data) {
      // Return empty/default values if config not found
      return {
        adapters: {},
        adapterOptions: {},
        execution: { mode: 'in-process' },
      };
    }

    const config = configResult.data as Record<string, unknown>;

    return {
      adapters: config.platform?.adapters ?? {},
      adapterOptions: config.platform?.adapterOptions ?? {},
      execution: config.platform?.execution ?? { mode: 'in-process' },
    };
  } catch (error) {
    // Return empty/default values on error
    return {
      adapters: {},
      adapterOptions: {},
      execution: { mode: 'in-process' },
    };
  }
}

/**
 * Register platform configuration routes
 */
export async function registerPlatformRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig,
  repoRoot: string
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);
  const configPaths = resolvePaths(basePath, '/platform/config');

  for (const path of configPaths) {
    fastify.get(path, async (_request, reply) => {
      try {
        const { adapters, adapterOptions, execution } = await restDomainOperationMetrics.observeOperation(
          'platform.config.get',
          () => loadPlatformConfig(repoRoot),
        );

        const redacted: string[] = [];
        const sanitizedOptions = redactSensitiveData(adapterOptions as Record<string, any>, redacted);

        const payload: PlatformConfigPayload = {
          schema: 'kb.platform.config/1',
          ts: new Date().toISOString(),
          adapters,
          adapterOptions: sanitizedOptions,
          execution,
          redacted,
        };

        const response: PlatformConfigResponse = {
          ok: true,
          data: payload,
        };

        return reply.send(response);
      } catch (error) {
        platform.logger.error('Failed to load platform config', error instanceof Error ? error : new Error(String(error)));
        return reply.code(500).send({
          ok: false,
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to load platform configuration',
          },
        });
      }
    });
  }
}
