import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { IEntityRegistry, SystemHealthSnapshot } from '@kb-labs/core-registry';
import type { ReadinessState } from './readiness';
import { isReady, resolveReadinessReason } from './readiness';
import type { EventHub, BroadcastEvent } from '../events/hub';
import { metricsCollector } from '../middleware/metrics.js';
import { buildRegistrySseAuthHook } from '../utils/sse-auth';

export async function registerEventRoutes(
  server: FastifyInstance,
  basePath: string,
  registry: IEntityRegistry,
  readiness: ReadinessState,
  eventHub: EventHub,
  config: RestApiConfig
): Promise<void> {
  const endpoint = `${basePath}/events/registry`;
  const authHook = buildRegistrySseAuthHook(config);

  server.route({
    method: 'GET',
    url: endpoint,
    onRequest: authHook ? [authHook] : undefined,
    handler: async (request, reply) => {
      // Tell Fastify we're manually managing the response
      reply.hijack();

      // Explicit CORS headers for EventSource (browser requires these before opening connection)
      const origin = request.headers.origin;
      if (origin === 'http://localhost:3000' || origin === 'http://localhost:5173') {
        reply.raw.setHeader('Access-Control-Allow-Origin', origin);
        reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.flushHeaders?.();
      reply.raw.write(': connected\n\n');

      const send = (event: BroadcastEvent) => {
        reply.raw.write(`event: ${event.type}\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const unsubscribe = eventHub.subscribe(send);

      const snapshot = registry.snapshot();
      const checksumAlgorithm = snapshot.checksumAlgorithm === 'sha256' ? 'sha256' : undefined;
      send({
        type: 'registry',
        rev: snapshot.rev,
        generatedAt: snapshot.generatedAt,
        partial: snapshot.partial,
        stale: snapshot.stale,
        expiresAt: snapshot.expiresAt ?? null,
        ttlMs: snapshot.ttlMs ?? null,
        checksum: snapshot.checksum ?? undefined,
        checksumAlgorithm,
        previousChecksum: snapshot.previousChecksum ?? null,
      });

      const healthPromise = registry
        .getSystemHealth()
        .then((health: SystemHealthSnapshot) => {
          const ready = isReady(readiness);
          const reason = resolveReadinessReason(readiness);
          const pluginSnapshot = metricsCollector.getLastPluginMountSnapshot();
          const redisStatus = (registry as any).getRedisStatus?.();
          send({
            type: 'health',
            status: health.status,
            ts: health.ts,
            ready,
            reason,
            registryPartial: readiness.registryPartial,
            registryStale: readiness.registryStale,
            registryLoaded: readiness.registryLoaded,
            pluginMountInProgress: readiness.pluginMountInProgress,
            pluginRoutesMounted: readiness.pluginRoutesMounted,
            pluginsMounted: pluginSnapshot?.succeeded ?? 0,
            pluginsFailed: pluginSnapshot?.failed ?? 0,
            lastPluginMountTs: readiness.lastPluginMountTs ?? null,
            pluginRoutesLastDurationMs: readiness.pluginRoutesLastDurationMs ?? null,
            redisEnabled: redisStatus?.enabled ?? false,
            redisHealthy: redisStatus?.healthy ?? true,
            redisStates: redisStatus?.roles,
          });
        })
        .catch((error: unknown) => {
          if ((request as any).kbLogger) {
            (request as any).kbLogger.warn('Failed to fetch system health for SSE client', { err: error });
          }
        });

      await new Promise<void>((resolve) => {
        request.raw.on('close', () => {
          unsubscribe();
          reply.raw.end();
          resolve();
        });
        // In inject/test mode, the socket is not a real TCP socket and 'close' may not fire.
        // Wait for health fetch to complete before resolving so health event is included in response.
        if (request.raw.socket && !(request.raw.socket as any).writable) {
          void healthPromise.then(() => {
            unsubscribe();
            reply.raw.end();
            resolve();
          });
        }
      });
    },
  });
}
