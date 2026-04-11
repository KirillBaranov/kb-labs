import { platform } from '@kb-labs/core-runtime';
/**
 * @module @kb-labs/rest-api-app/routes/cache
 * Cache management routes
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { IEntityRegistry } from '@kb-labs/core-registry';
import { normalizeBasePath } from '../utils/path-helpers';
import { restDomainOperationMetrics } from '../middleware/metrics.js';

/**
 * Register cache management routes
 */
export async function registerCacheRoutes(
  server: FastifyInstance,
  config: RestApiConfig,
  registry: IEntityRegistry
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  /**
   * POST /api/v1/cache/invalidate
   * Force cache invalidation and registry refresh
   */
  server.post(`${basePath}/cache/invalidate`, async (request, reply) => {
    const start = Date.now();

    try {
      // Capture current state
      const beforeSnapshot = registry.snapshot();
      const previousRev = beforeSnapshot.rev;

      platform.logger.info('Manual cache invalidation requested', {
        requestId: request.id,
        previousRev,
      });
      // Force cache invalidation and refresh discovery
      // This will trigger re-discovery and clear stale cache
      await restDomainOperationMetrics.observeOperation('cache.invalidate', async () => {
        await registry.refresh();
      });

      // Get new state
      const afterSnapshot = await restDomainOperationMetrics.observeOperation('plugin.registry.snapshot', async () =>
        registry.snapshot(),
      );
      const plugins = await restDomainOperationMetrics.observeOperation('plugin.registry.list', async () =>
        registry.listPlugins(),
      );

      const elapsed = Date.now() - start;

      platform.logger.info('Cache invalidated successfully', {
        requestId: request.id,
        previousRev,
        newRev: afterSnapshot.rev,
        pluginsDiscovered: plugins.length,
        elapsedMs: elapsed,
      });

      return reply.code(200).send({
        ok: true,
        data: {
          invalidated: true,
          timestamp: new Date().toISOString(),
          previousRev,
          newRev: afterSnapshot.rev,
          pluginsDiscovered: plugins.length,
        },
        meta: {
          requestId: request.id,
          durationMs: elapsed,
          apiVersion: '1.0.0',
        },
      });
    } catch (error) {
      const elapsed = Date.now() - start;

      platform.logger.error(
        'Cache invalidation failed',
        error instanceof Error ? error : new Error(String(error)),
        {
          requestId: request.id as string,
          elapsedMs: elapsed,
        }
      );

      return reply.code(500).send({
        ok: false,
        error: {
          code: 'CACHE_INVALIDATION_FAILED',
          message: error instanceof Error ? error.message : 'Cache invalidation failed',
        },
        meta: {
          requestId: request.id,
          durationMs: elapsed,
          apiVersion: '1.0.0',
        },
      });
    }
  });
}
