/**
 * @module @kb-labs/gateway-app/internal/routes
 * Service-to-service endpoints — NOT for external clients.
 * Auth: x-internal-secret header (GATEWAY_INTERNAL_SECRET env var).
 *
 * POST /internal/dispatch      — invoke adapter method on a connected host
 * POST /internal/resolve-host  — resolve hostId for namespace + strategy
 */

import type { FastifyInstance } from 'fastify';
import { globalDispatcher } from '../hosts/dispatcher.js';
import type { HostRegistry } from '../hosts/registry.js';

export function registerInternalRoutes(
  scope: FastifyInstance,
  internalSecret: string | undefined,
  hostRegistry: HostRegistry,
): void {
  scope.post('/internal/dispatch', async (request, reply) => {
    const provided = request.headers['x-internal-secret'];
    if (!internalSecret || provided !== internalSecret) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = request.body as {
      namespaceId?: string;
      hostId?: string;
      adapter?: string;
      method?: string;
      args?: unknown[];
    };

    if (!body.namespaceId || !body.adapter || !body.method) {
      return reply.code(400).send({ error: 'Missing required fields: namespaceId, adapter, method' });
    }

    const hostId = body.hostId
      ?? globalDispatcher.firstHostWithCapability(body.namespaceId, body.adapter)
      ?? globalDispatcher.firstHost(body.namespaceId);
    if (!hostId) {
      return reply.code(503).send({
        error: 'No host connected',
        namespaceId: body.namespaceId,
      });
    }

    try {
      const result = await globalDispatcher.call(
        body.namespaceId,
        hostId,
        body.adapter,
        body.method,
        body.args ?? [],
      );
      return { result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Host not connected')) {
        return reply.code(503).send({ error: message });
      }
      return reply.code(502).send({ error: message });
    }
  });

  scope.post('/internal/resolve-host', async (request, reply) => {
    const provided = request.headers['x-internal-secret'];
    if (!internalSecret || provided !== internalSecret) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const body = request.body as {
      namespaceId?: string;
      target?: {
        hostId?: string;
        hostSelection?: string;
        repoFingerprint?: string;
      };
    };

    const namespaceId = body.namespaceId ?? 'default';
    const target = body.target ?? {};
    const strategy = (target.hostSelection ?? 'any-matching') as string;

    let hostId: string | undefined;

    if (strategy === 'pinned' && target.hostId) {
      const host = await hostRegistry.get(target.hostId, namespaceId);
      if (host?.status === 'online' || host?.status === 'reconnecting') {
        hostId = target.hostId;
      }
    } else {
      hostId = globalDispatcher.firstHostWithCapability(namespaceId, 'execution');
    }

    if (!hostId) {
      return reply.code(404).send({ error: 'No matching host found' });
    }

    return { hostId, strategy, namespaceId };
  });
}
