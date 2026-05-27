/**
 * @module webhook/admin-routes
 *
 * Admin HTTP routes for webhook management. Must be registered inside an
 * authenticated scope (request.authContext is expected to be set).
 *
 * Routes:
 *   POST   /api/v1/webhooks/provision              — provision or rotate a secret
 *   GET    /api/v1/webhooks[?pluginId=]             — list declared webhooks
 *   DELETE /api/v1/webhooks/:pluginId/:event        — revoke (single-instance)
 *   DELETE /api/v1/webhooks/:pluginId/:event/:instanceId — revoke (multi-instance)
 *
 * namespaceId is taken from request.authContext — callers operate on their
 * own namespace only. No cross-namespace access.
 */

import type { FastifyInstance } from 'fastify';
import type { ICache, ILogger } from '@kb-labs/core-platform';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import { WebhookSecretStore } from './secret-store.js';
import { provisionWebhook, type ProvisionBackend } from './provision.js';
import type { WebhookManifestEntry } from './router.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RegisterWebhookAdminRoutesOptions {
  cache: ICache;
  logger: ILogger;
  backend: ProvisionBackend;
  manifests: WebhookManifestEntry[];
  baseUrl: string;
  /** Optional rate limiter — when provided, admin routes are rate-limited. */
  broker?: IResourceBroker;
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Rate limit resources ──────────────────────────────────────────────────────

const RL_PROVISION = 'webhook-admin:provision';
const RL_LIST = 'webhook-admin:list';
const RL_REVOKE = 'webhook-admin:revoke';

// ── Public API ────────────────────────────────────────────────────────────────

export function registerWebhookAdminRoutes(
  scope: FastifyInstance,
  options: RegisterWebhookAdminRoutesOptions,
): void {
  const { cache, logger, backend, manifests, baseUrl, broker } = options;
  const secretStore = new WebhookSecretStore(cache);

  // Register per-resource rate limits when a broker is available.
  // Admin operations are infrequent; conservative limits prevent abuse.
  if (broker) {
    broker.registerLimit(RL_PROVISION, { requestsPerMinute: 10 });
    broker.registerLimit(RL_LIST, { requestsPerMinute: 60 });
    broker.registerLimit(RL_REVOKE, { requestsPerMinute: 10 });
  }

  // ── POST /api/v1/webhooks/provision ─────────────────────────────────────────

  scope.post('/api/v1/webhooks/provision', async (request, reply) => {
    const auth = request.authContext;
    if (!auth) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Rate limit provisioning requests
    if (broker) {
      const acquired = await broker.tryAcquire(RL_PROVISION);
      try {
        if (!acquired.allowed) {
          const retryAfterSec = acquired.waitTimeMs ? Math.max(1, Math.ceil(acquired.waitTimeMs / 1000)) : 1;
          return reply.code(429).header('Retry-After', String(retryAfterSec)).send({ error: 'Too Many Requests' });
        }
      } finally {
        await acquired.release();
      }
    }

    const body = request.body as Record<string, unknown> | undefined;
    const pluginId = typeof body?.pluginId === 'string' ? body.pluginId : undefined;
    const event = typeof body?.event === 'string' ? body.event : undefined;
    const instanceId = typeof body?.instanceId === 'string' ? body.instanceId : undefined;

    if (!pluginId) {
      return reply.code(400).send({ error: 'Bad Request', message: 'pluginId is required' });
    }
    if (!event) {
      return reply.code(400).send({ error: 'Bad Request', message: 'event is required' });
    }

    try {
      const result = await provisionWebhook(
        { namespaceId: auth.namespaceId, pluginId, event, instanceId, baseUrl },
        secretStore,
        backend,
        manifests,
        logger,
      );

      return reply.code(200).send({
        url: result.url,
        secret: result.secret,
        rotated: result.rotated,
      });
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return reply.code(404).send({ error: 'Not Found', message: err.message });
      }
      throw err;
    }
  });

  // ── GET /api/v1/webhooks ─────────────────────────────────────────────────────

  scope.get('/api/v1/webhooks', async (request, reply) => {
    const auth = request.authContext;
    if (!auth) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Rate limit list requests
    if (broker) {
      const acquired = await broker.tryAcquire(RL_LIST);
      try {
        if (!acquired.allowed) {
          const retryAfterSec = acquired.waitTimeMs ? Math.max(1, Math.ceil(acquired.waitTimeMs / 1000)) : 1;
          return reply.code(429).header('Retry-After', String(retryAfterSec)).send({ error: 'Too Many Requests' });
        }
      } finally {
        await acquired.release();
      }
    }

    const query = request.query as Record<string, string | undefined>;
    const filterPluginId = query.pluginId;

    const webhooks: Array<{ pluginId: string; event: string; multi: boolean; provisioned: boolean }> = [];

    for (const entry of manifests) {
      if (filterPluginId && entry.pluginId !== filterPluginId) continue;
      if (!entry.manifest.webhooks?.handlers) continue;

      for (const decl of entry.manifest.webhooks.handlers) {
        // For multi webhooks the provisioned check is per-instanceId; we show false
        // at the list level since there is no shared base entry.
        const secretEntry = decl.multi
          ? null
          : await secretStore.get(auth.namespaceId, entry.pluginId, decl.event);

        webhooks.push({
          pluginId: entry.pluginId,
          event: decl.event,
          multi: decl.multi === true,
          provisioned: secretEntry !== null,
        });
      }
    }

    return reply.code(200).send({ webhooks });
  });

  // ── DELETE /api/v1/webhooks/:pluginId/:event ──────────────────────────────────

  scope.delete<{ Params: { pluginId: string; event: string } }>(
    '/api/v1/webhooks/:pluginId/:event',
    async (request, reply) => {
      const auth = request.authContext;
      if (!auth) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      // Rate limit revoke requests
      if (broker) {
        const acquired = await broker.tryAcquire(RL_REVOKE);
        try {
          if (!acquired.allowed) {
            const retryAfterSec = acquired.waitTimeMs ? Math.max(1, Math.ceil(acquired.waitTimeMs / 1000)) : 1;
            return reply.code(429).header('Retry-After', String(retryAfterSec)).send({ error: 'Too Many Requests' });
          }
        } finally {
          await acquired.release();
        }
      }

      const { pluginId, event } = request.params;
      await secretStore.delete(auth.namespaceId, pluginId, event);
      return reply.code(204).send();
    },
  );

  // ── DELETE /api/v1/webhooks/:pluginId/:event/:instanceId ──────────────────────

  scope.delete<{ Params: { pluginId: string; event: string; instanceId: string } }>(
    '/api/v1/webhooks/:pluginId/:event/:instanceId',
    async (request, reply) => {
      const auth = request.authContext;
      if (!auth) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      // Rate limit revoke requests
      if (broker) {
        const acquired = await broker.tryAcquire(RL_REVOKE);
        try {
          if (!acquired.allowed) {
            const retryAfterSec = acquired.waitTimeMs ? Math.max(1, Math.ceil(acquired.waitTimeMs / 1000)) : 1;
            return reply.code(429).header('Retry-After', String(retryAfterSec)).send({ error: 'Too Many Requests' });
          }
        } finally {
          await acquired.release();
        }
      }

      const { pluginId, event, instanceId } = request.params;
      await secretStore.delete(auth.namespaceId, pluginId, event, instanceId);
      return reply.code(204).send();
    },
  );
}
