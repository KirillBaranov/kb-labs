/**
 * @module @kb-labs/rest-api-app/routes/debug-routes
 * Debug endpoint to list all registered routes
 *
 * GET /api/v1/routes - List all registered routes with methods
 */

import type { FastifyInstance, RouteOptions } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { normalizeBasePath, resolvePaths } from '../utils/path-helpers';

interface RouteInfo {
  method: string;
  url: string;
}

// Store for collected routes (populated via onRoute hook)
const collectedRoutes: RouteInfo[] = [];
const seenRoutes = new Set<string>();

/**
 * Hook to collect routes as they are registered
 */
function collectRoute(routeOptions: RouteOptions): void {
  const methods = Array.isArray(routeOptions.method)
    ? routeOptions.method
    : [routeOptions.method];

  for (const method of methods) {
    // Skip HEAD (auto-generated for GET routes) and internal routes
    if (method === 'HEAD') {continue;}

    const url = routeOptions.url;
    const key = `${method}:${url}`;

    if (!seenRoutes.has(key)) {
      seenRoutes.add(key);
      collectedRoutes.push({ method, url });
    }
  }
}

/**
 * Register the onRoute hook to collect routes
 * Must be called early, before other routes are registered
 */
export function registerRouteCollector(fastify: FastifyInstance): void {
  fastify.addHook('onRoute', collectRoute);
}

/**
 * Register debug routes endpoint
 */
export async function registerDebugRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);
  const routesPaths = resolvePaths(basePath, '/routes');

  for (const path of routesPaths) {
    fastify.get(path, async (_request, reply) => {
      // Filter to only show /api/v1 routes (skip duplicates without prefix)
      let routes = collectedRoutes.filter(r => r.url.startsWith('/api/'));

      // If no API routes found, show all (fallback)
      if (routes.length === 0) {
        routes = [...collectedRoutes];
      }

      // Sort routes by URL, then by method
      routes.sort((a, b) => {
        const urlCompare = a.url.localeCompare(b.url);
        if (urlCompare !== 0) {return urlCompare;}
        return a.method.localeCompare(b.method);
      });

      // Get raw printRoutes for debugging (optional)
      let raw: string | null = null;
      try {
        raw = fastify.printRoutes({ commonPrefix: false });
      } catch {
        // Ignore if not available
      }

      return reply.send({
        schema: 'kb.routes/1',
        ts: new Date().toISOString(),
        count: routes.length,
        routes,
        raw,
      });
    });
  }
}
