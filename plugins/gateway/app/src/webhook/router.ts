/**
 * @module webhook/router
 *
 * Registers Fastify routes for manifest-declared webhook handlers.
 *
 * Route patterns:
 *   POST /webhooks/:pluginId/:event              (single-instance)
 *   POST /webhooks/:pluginId/:event/:instanceId  (multi: true)
 *
 * Per-request pipeline:
 *   1. Lookup declaration → 404 if unknown pluginId/event
 *   2. x-kb-namespace header → 400 if missing
 *   3. Rate limit via IResourceBroker → 429 if denied
 *   4. Challenge response → 200 (before auth, intentional for Slack handshake)
 *   5. Idempotency dedup → 200 early if duplicate delivery
 *   6. Auth (secret / hmac / custom) → 401 on failure
 *   7. Dispatch via globalDispatcher → 200 sync / 202 async
 *
 * Security: missing auth on any declaration causes startup rejection.
 * Plugin code never runs in-process — always dispatched via globalDispatcher.
 */

import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ManifestV3, WebhookHandlerDecl } from '@kb-labs/plugin-contracts';
import type { ICache, ILogger } from '@kb-labs/core-platform';
import type { IResourceBroker } from '@kb-labs/core-resource-broker';
import { globalDispatcher } from '../hosts/dispatcher.js';
import { WebhookSecretStore } from './secret-store.js';
import { WebhookIdempotencyStore } from './idempotency-store.js';
import { verifyWebhookAuth, type WebhookAuthRequest } from './auth.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WebhookManifestEntry {
  pluginId: string;
  manifest: ManifestV3;
  pluginRoot: string;
}

export interface RegisterWebhookRoutesOptions {
  cache: ICache;
  broker: IResourceBroker;
  logger: ILogger;
  manifests: WebhookManifestEntry[];
  baseUrl?: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Extract a nested value by dot-separated path (e.g. 'delivery.id'). */
function getByDotPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Entry in the per-plugin declaration lookup map. */
interface DeclEntry {
  pluginId: string;
  decl: WebhookHandlerDecl;
  pluginRoot: string;
  manifest: ManifestV3;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register webhook routes from plugin manifests.
 *
 * @returns Number of webhook routes registered.
 * @throws If any declaration is missing an `auth` config.
 */
export async function registerWebhookRoutes(
  scope: FastifyInstance,
  options: RegisterWebhookRoutesOptions,
): Promise<number> {
  const { cache, broker, logger, manifests } = options;

  const secretStore = new WebhookSecretStore(cache);
  const idempotencyStore = new WebhookIdempotencyStore(cache);

  // Build lookup maps, validate, register rate limits
  const declMap = new Map<string, DeclEntry>();
  let needsRawBody = false;

  for (const entry of manifests) {
    const { pluginId, manifest, pluginRoot } = entry;
    if (!manifest.webhooks?.handlers.length) continue;

    for (const decl of manifest.webhooks.handlers) {
      if (!decl.auth) {
        throw new Error(`webhook '${pluginId}/${decl.event}' has no auth config`);
      }

      const mapKey = `${pluginId}:${decl.event}:${decl.multi ? 'multi' : 'single'}`;
      declMap.set(mapKey, { pluginId, decl, pluginRoot, manifest });

      broker.registerLimit(`webhook:${pluginId}:${decl.event}`, {
        requestsPerMinute: decl.rateLimit?.requestsPerMinute ?? 60,
      });

      if (decl.auth.type === 'hmac' || decl.auth.type === 'custom') {
        needsRawBody = true;
      }
    }
  }

  if (declMap.size === 0) return 0;

  // Capture raw body for HMAC / custom auth verification.
  // NOTE: this scope must contain only webhook delivery routes — the preParsing
  // hook fires for every route registered here, buffering the body each time.
  if (needsRawBody) {
    scope.addHook('preParsing', async (_request, _reply, payload) => {
      const chunks: Buffer[] = [];
      for await (const chunk of payload) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as unknown as string));
      }
      const body = Buffer.concat(chunks);
      _request.rawBody = body;
      return Readable.from(body);
    });
  }

  // ── Single-instance handler ─────────────────────────────────────────────────
  // NOTE: pluginIds containing '/' (e.g. @scope/name) must be URL-encoded by
  // callers: '@scope%2Fname' → Fastify decodes back to '@scope/name' in params.

  scope.post<{ Params: { pluginId: string; event: string } }>(
    '/webhooks/:pluginId/:event',
    async (request, reply) => {
      const { pluginId, event } = request.params;
      const entry = declMap.get(`${pluginId}:${event}:single`);
      if (!entry) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      return handleWebhook({ request, reply, entry, namespaceHeader: request.headers['x-kb-namespace'], instanceId: undefined, secretStore, idempotencyStore, broker, logger });
    },
  );

  // ── Multi-instance handler ──────────────────────────────────────────────────

  scope.post<{ Params: { pluginId: string; event: string; instanceId: string } }>(
    '/webhooks/:pluginId/:event/:instanceId',
    async (request, reply) => {
      const { pluginId, event, instanceId } = request.params;
      const entry = declMap.get(`${pluginId}:${event}:multi`);
      if (!entry) {
        return reply.code(404).send({ error: 'Webhook not found' });
      }

      return handleWebhook({ request, reply, entry, namespaceHeader: request.headers['x-kb-namespace'], instanceId, secretStore, idempotencyStore, broker, logger });
    },
  );

  return declMap.size;
}

// ── Per-request handler ───────────────────────────────────────────────────────

interface HandleWebhookArgs {
  request: FastifyRequest;
  reply: FastifyReply;
  entry: DeclEntry;
  namespaceHeader: string | string[] | undefined;
  instanceId: string | undefined;
  secretStore: WebhookSecretStore;
  idempotencyStore: WebhookIdempotencyStore;
  broker: IResourceBroker;
  logger: ILogger;
}

async function handleWebhook({
  request,
  reply,
  entry,
  namespaceHeader,
  instanceId,
  secretStore,
  idempotencyStore,
  broker,
  logger,
}: HandleWebhookArgs): Promise<unknown> {
  const { pluginId, decl, pluginRoot, manifest } = entry;

  // Step 1: Resolve namespace
  const namespaceId = Array.isArray(namespaceHeader) ? namespaceHeader[0] : namespaceHeader;
  if (!namespaceId) {
    return reply.code(400).send({ error: 'Missing required header: x-kb-namespace' });
  }

  // Step 2: Rate limit
  // Use the unconditional try/finally pattern: release() is a no-op when allowed=false,
  // so the finally block is safe regardless of whether the request was accepted.
  const rateResource = `webhook:${pluginId}:${decl.event}`;
  const acquired = await broker.tryAcquire(rateResource);

  try {
    if (!acquired.allowed) {
      const retryAfterSec = acquired.waitTimeMs ? Math.max(1, Math.ceil(acquired.waitTimeMs / 1000)) : 1;
      return reply.code(429).header('Retry-After', String(retryAfterSec)).send({
        error: 'Too Many Requests',
        retryAfterMs: acquired.waitTimeMs ?? null,
      });
    }

    // Step 3: Challenge (before auth — Slack-style handshake)
    if (decl.challenge && request.body) {
      const fieldValue = getByDotPath(request.body, decl.challenge.bodyPath);
      if (fieldValue === decl.challenge.value) {
        const replyValue = getByDotPath(request.body, decl.challenge.replyPath);
        return reply.code(200).send({ [decl.challenge.replyPath]: replyValue });
      }
    }

    // Step 4: Idempotency dedup (intentionally before auth — matches the delivery model
    // where external services retry the same delivery ID on transient failures).
    // Trade-off: an unauthenticated caller can mark a key as seen before the real delivery.
    // Acceptable because idempotency keys are provider-controlled (e.g. GitHub X-GitHub-Delivery).
    if (decl.idempotencyKey && request.body) {
      const deliveryKey = getByDotPath(request.body, decl.idempotencyKey);
      if (typeof deliveryKey === 'string') {
        const isDuplicate = await idempotencyStore.checkAndMark(pluginId, decl.event, deliveryKey);
        if (isDuplicate) {
          return reply.code(200).send({ status: 'duplicate' });
        }
      }
    }

    // Step 5: Auth
    const rawBody: Buffer = request.rawBody
      ?? Buffer.from(typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? ''));

    const authReq: WebhookAuthRequest = {
      headers: request.headers as Record<string, string | string[] | undefined>,
      rawBody,
      namespaceId,
      pluginId,
      event: decl.event,
      instanceId,
    };

    const authBackend = decl.auth.type === 'custom'
      ? makeAuthBackend(namespaceId, pluginId)
      : undefined;

    const authResult = await verifyWebhookAuth(decl.auth, authReq, secretStore, authBackend, pluginRoot);
    if (!authResult.valid) {
      return reply.code(401).send({ error: 'Unauthorized', reason: authResult.reason });
    }

    // Step 6: Build host context
    const webhookId = randomUUID();
    const hostContext = {
      host: 'webhook' as const,
      event: decl.event,
      source: request.ip,
      payload: request.body,
      namespaceId,
      webhookId,
      ...(instanceId !== undefined ? { instanceId } : {}),
    };

    // Step 7: Resolve execution host
    const hostId = globalDispatcher.firstHostWithCapability(namespaceId, 'execution');
    if (!hostId) {
      return reply.code(503).send({ error: 'No execution host connected' });
    }

    const dispatchArgs = [{
      pluginId,
      handlerRef: decl.handler,
      input: request.body,
      executionId: webhookId,
      requestId: webhookId,
      descriptor: {
        hostType: 'webhook' as const,
        hostContext,
        pluginId,
        pluginVersion: manifest.version,
        requestId: webhookId,
        permissions: decl.permissions ?? [],
      },
    }];

    // Step 8: Dispatch
    if (decl.async) {
      reply.code(202).send({ status: 'accepted', webhookId });
      void globalDispatcher.call(namespaceId, hostId, 'execution', 'execute', dispatchArgs).catch((err: unknown) => {
        logger.error(
          'Webhook async dispatch failed',
          err instanceof Error ? err : new Error(String(err)),
          { pluginId, event: decl.event, webhookId },
        );
      });
      return;
    }

    try {
      const result = await globalDispatcher.call(namespaceId, hostId, 'execution', 'execute', dispatchArgs);
      return reply.code(200).send({ status: 'ok', webhookId, result });
    } catch (err) {
      logger.error(
        'Webhook dispatch failed',
        err instanceof Error ? err : new Error(String(err)),
        { pluginId, event: decl.event, webhookId },
      );
      return reply.code(500).send({ error: 'Dispatch failed' });
    }
  } finally {
    await acquired.release();
  }
}

// ── Auth execution backend for 'custom' auth type ─────────────────────────────

function makeAuthBackend(
  namespaceId: string,
  pluginId: string,
): {
  execute(input: { handlerRef: string; pluginRoot: string; input: unknown }): Promise<unknown>;
} {
  return {
    async execute({ handlerRef, pluginRoot, input }) {
      const hostId = globalDispatcher.firstHostWithCapability(namespaceId, 'execution');
      if (!hostId) throw new Error('No execution host connected for custom auth');
      // Pass pluginId so the host-agent's LocalPluginResolver can find the plugin root,
      // and pluginRoot as an absolute path hint for environments that support it.
      return globalDispatcher.call(namespaceId, hostId, 'execution', 'execute', [
        { pluginId, handlerRef, pluginRoot, input },
      ]);
    },
  };
}
