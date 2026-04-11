/**
 * @module Unified Platform API — single dispatch for any adapter.
 *
 * Route: POST /platform/v1/{adapter}/{method}
 *
 * Provides a single entry point for all platform adapters (LLM, Cache,
 * VectorStore, Analytics, Storage, Embeddings, etc.). Adapter and method
 * come from URL params; arguments come from the request body.
 *
 * Security: only methods explicitly listed in ALLOWED_METHODS are callable.
 */
import type { FastifyInstance } from 'fastify';
import { platform } from '@kb-labs/core-runtime';
import type { ILogger } from '@kb-labs/core-platform';
import {
  PlatformCallRequestSchema,
  type PlatformCallResponse,
} from '@kb-labs/gateway-contracts';

// ── Method allowlist ──────────────────────────────────────────────────────
// Only methods listed here are callable via the Platform API.
// Internal/lifecycle methods (setSource, shutdown, etc.) are NOT exposed.

const ALLOWED_METHODS: Record<string, Set<string>> = {
  llm: new Set(['complete', 'stream', 'chatWithTools']),
  cache: new Set(['get', 'set', 'delete', 'clear']),
  vectorStore: new Set(['search', 'upsert', 'delete', 'count']),
  analytics: new Set(['track', 'identify', 'flush', 'getEvents', 'getStats', 'getDailyStats']),
  embeddings: new Set(['embed']),
  storage: new Set(['read', 'write', 'delete', 'list', 'exists']),
  eventBus: new Set(['publish', 'subscribe']),
  sqlDatabase: new Set(['query', 'execute']),
  documentDatabase: new Set(['find', 'findOne', 'insert', 'update', 'delete']),
};

// ── Adapter resolution ────────────────────────────────────────────────────

function resolveAdapter(name: string): unknown | undefined {
  // Map URL param to platform property
  const adapterMap: Record<string, () => unknown> = {
    llm: () => platform.llm,
    cache: () => platform.cache,
    analytics: () => platform.analytics,
    vectorStore: () => platform.vectorStore,
    embeddings: () => platform.embeddings,
    storage: () => platform.storage,
    eventBus: () => platform.eventBus,
    sqlDatabase: () => platform.sqlDatabase,
    documentDatabase: () => platform.documentDatabase,
  };

  const getter = adapterMap[name];
  return getter ? getter() : undefined;
}

// ── Streaming detection ───────────────────────────────────────────────────

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Symbol.asyncIterator in (value as object)
  );
}

// ── Route registration ────────────────────────────────────────────────────

export function registerPlatformRoutes(app: FastifyInstance, logger: ILogger): void {
  // hide: true — can return SSE (text/event-stream) for streaming adapter calls, incompatible with OpenAPI response schema
  app.post<{ Params: { adapter: string; method: string } }>(
    '/platform/v1/:adapter/:method',
    { schema: { tags: ['Platform'], summary: 'Invoke a platform adapter method', hide: true } },
    async (request, reply) => {
      const auth = request.authContext;
      if (!auth) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }

      const { adapter: adapterName, method: methodName } = request.params;

      // 1. Check adapter is in allowlist
      const allowedMethods = ALLOWED_METHODS[adapterName];
      if (!allowedMethods) {
        return reply.code(404).send({
          ok: false,
          error: { message: `Unknown adapter: "${adapterName}"`, code: 'ADAPTER_NOT_FOUND' },
          durationMs: 0,
        } satisfies PlatformCallResponse);
      }

      // 2. Check method is allowed
      if (!allowedMethods.has(methodName)) {
        return reply.code(403).send({
          ok: false,
          error: { message: `Method "${methodName}" not allowed on adapter "${adapterName}"`, code: 'METHOD_NOT_ALLOWED' },
          durationMs: 0,
        } satisfies PlatformCallResponse);
      }

      // 3. Resolve adapter instance
      const adapter = resolveAdapter(adapterName);
      if (!adapter) {
        return reply.code(503).send({
          ok: false,
          error: { message: `Adapter "${adapterName}" not configured`, code: 'ADAPTER_UNAVAILABLE' },
          durationMs: 0,
        } satisfies PlatformCallResponse);
      }

      // 4. Check method exists on adapter
      const method = (adapter as Record<string, unknown>)[methodName];
      if (typeof method !== 'function') {
        return reply.code(501).send({
          ok: false,
          error: { message: `Method "${methodName}" not implemented on adapter "${adapterName}"`, code: 'METHOD_NOT_IMPLEMENTED' },
          durationMs: 0,
        } satisfies PlatformCallResponse);
      }

      // 5. Parse args
      const parsed = PlatformCallRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: { message: 'Invalid request body', code: 'VALIDATION_ERROR' },
          durationMs: 0,
        } satisfies PlatformCallResponse);
      }

      const { args } = parsed.data;

      logger.info('Platform API call', {
        adapter: adapterName,
        method: methodName,
        argCount: args.length,
        tenantId: auth.namespaceId,
      });

      // 6. Execute
      const startTime = Date.now();

      try {
        const result = method.apply(adapter, args);

        // Handle async results
        const resolved = result instanceof Promise ? await result : result;

        // 7. Detect streaming response (e.g., llm.stream)
        if (isAsyncIterable(resolved)) {
          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          });
          reply.raw.flushHeaders();

          for await (const chunk of resolved) {
            if (!reply.raw.writableEnded) {
              const data = typeof chunk === 'string' ? chunk : JSON.stringify(chunk);
              reply.raw.write(`data: ${data}\n\n`);
            }
          }

          if (!reply.raw.writableEnded) {
            reply.raw.write('data: [DONE]\n\n');
            reply.raw.end();
          }

          return reply;
        }

        // 8. Regular response
        const durationMs = Date.now() - startTime;
        return reply.code(200).send({
          ok: true,
          result: resolved,
          durationMs,
        } satisfies PlatformCallResponse);
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error('Platform API error', error, {
          adapter: adapterName,
          method: methodName,
          tenantId: auth.namespaceId,
        });
        return reply.code(502).send({
          ok: false,
          error: { message: error.message, code: 'ADAPTER_ERROR' },
          durationMs,
        } satisfies PlatformCallResponse);
      }
    },
  );
}
