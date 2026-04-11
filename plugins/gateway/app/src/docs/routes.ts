/**
 * @module gateway-app/docs/routes
 * Aggregated OpenAPI documentation endpoints.
 *
 * GET /openapi-merged.json — merged spec from all upstream services
 * GET /docs-all            — Swagger UI pointing at the merged spec
 */

import type { FastifyInstance } from 'fastify';
import { mergeOpenAPISpecs } from '@kb-labs/core-registry';
import type { ICache } from '@kb-labs/core-platform';

const MERGED_CACHE_KEY = '__gateway_merged_openapi';
const MERGED_CACHE_TTL = 30_000; // 30 second cache

const UPSTREAM_SPEC_URLS = [
  'http://localhost:5050/openapi.json',
  'http://localhost:7778/openapi.json',
];

export function registerAggregatedDocsRoutes(app: FastifyInstance, cache?: ICache): void {
  // Merged OpenAPI spec from all upstreams
  app.get('/openapi-merged.json', async (_req, reply) => {
    // Try cache first
    if (cache) {
      try {
        const hit = await cache.get<Record<string, unknown>>(MERGED_CACHE_KEY);
        if (hit) {
          return reply.send(hit);
        }
      } catch { /* cache miss */ }
    }

    // Fetch all upstream specs in parallel
    const results = await Promise.allSettled(
      UPSTREAM_SPEC_URLS.map((url) =>
        fetch(url, { signal: AbortSignal.timeout(3000) }).then((r) => r.json()),
      ),
    );

    const specs = results
      .filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled')
      .map((r) => r.value);

    const merged = mergeOpenAPISpecs(specs as Parameters<typeof mergeOpenAPISpecs>[0]);

    // Cache result
    if (cache) {
      try {
        await cache.set(MERGED_CACHE_KEY, merged as unknown as Record<string, unknown>, MERGED_CACHE_TTL);
      } catch { /* cache write failure is non-critical */ }
    }

    return reply.send(merged);
  });

  // Second Swagger UI pointing at merged spec
  // Registered last so /docs (gateway-native) is already bound at this point
  app.register(async function docsAll(scope) {
    const swaggerUi = await import('@fastify/swagger-ui');
    await scope.register(swaggerUi.default ?? swaggerUi, {
      routePrefix: '/docs-all',
      uiConfig: {
        url: '/openapi-merged.json',
        docExpansion: 'list',
        deepLinking: true,
      },
    });
  });
}
