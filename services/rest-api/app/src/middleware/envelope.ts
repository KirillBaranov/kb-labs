/**
 * @module @kb-labs/rest-api-app/middleware/envelope
 * Response envelope wrapper middleware — single source of truth for error formatting.
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { errorEnvelopeSchema, type PluginErrorEnvelope } from '@kb-labs/rest-api-contracts';

function isPluginErrorEnvelope(err: unknown): err is PluginErrorEnvelope {
  return (
    err !== null &&
    typeof err === 'object' &&
    'status' in err &&
    (err as PluginErrorEnvelope).status === 'error' &&
    'meta' in err &&
    typeof (err as PluginErrorEnvelope).meta === 'object' &&
    'pluginId' in (err as PluginErrorEnvelope).meta
  );
}

/**
 * Register envelope middleware
 */
export function registerEnvelopeMiddleware(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  // Add response schema version header and wrap in envelope
  // Use 'onSend' hook to modify payload after Fastify serializes it but before sending
  // This ensures we get the serialized JSON string and can wrap it properly
  server.addHook('onSend', async (request, reply, payload) => {
    // Set header with try-catch to prevent ERR_HTTP_HEADERS_SENT
    try {
      if (!reply.raw.headersSent) {
        reply.header('x-schema-version', config.apiVersion);
      }
    } catch (err) {
      // Headers already sent, ignore
    }

    // Skip envelope wrapping for streaming responses
    if (reply.getHeader('content-type') === 'text/event-stream') {
      return payload;
    }

    // Serialize plain objects that reached onSend without going through
    // Fastify's serializer (happens with non-JSON content-type or in error
    // handler fallback chains). Buffer/stream/null pass through unchanged.
    if (typeof payload !== 'string') {
      if (
        payload === null ||
        payload === undefined ||
        Buffer.isBuffer(payload) ||
        typeof (payload as { pipe?: unknown }).pipe === 'function' ||
        typeof (payload as { getReader?: unknown }).getReader === 'function'
      ) {
        return payload;
      }
      // Plain object — serialize so onSendEnd receives a string
      try {
        return JSON.stringify(payload);
      } catch {
        return payload;
      }
    }

    // Parse the serialized JSON payload
    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      // If not JSON, return as is
      return payload;
    }

    // If payload is already an envelope (has 'ok' field), return as is
    if (parsedPayload && typeof parsedPayload === 'object' && 'ok' in parsedPayload) {
      return payload;
    }

    // Skip raw OpenAPI spec — marked by x-openapi-spec header set in shared-http
    if (reply.getHeader('x-openapi-spec')) {
      return payload;
    }

    // Wrap all non-streaming responses in envelope
    // Note: Even 4xx/5xx responses with data should be wrapped with ok: true
    // (e.g., 503 for health/ready still contains useful data)

    // Handle empty payloads
    let dataToWrap = parsedPayload;

    // If payload is undefined or null, wrap as null
    if (parsedPayload === null || parsedPayload === undefined) {
      dataToWrap = null;
    }

    // For responses with data (including 4xx/5xx with payload), wrap with ok: true
    // The HTTP status code indicates the result, but envelope.ok indicates successful request processing
    // Only responses without payload (handled by error handler) should have ok: false
    const envelope = {
      ok: true as const,
      data: dataToWrap,
      meta: {
        requestId: request.id || '',
        durationMs: reply.elapsedTime || 0,
        apiVersion: config.apiVersion,
      },
    };

    // Set Content-Type header if not set
    if (!reply.getHeader('content-type')) {
      try {
        if (!reply.raw.headersSent) {
          reply.header('content-type', 'application/json');
        }
      } catch (err) {
        // Headers already sent, ignore
      }
    }

    // Serialize and return envelope as string
    return JSON.stringify(envelope);
  });

  // Single error handler: normalises both PluginErrorEnvelope (from plugin runtime)
  // and plain Errors into the canonical ErrorEnvelope { ok: false, error, meta }.
  server.setErrorHandler(async (error: unknown, request, reply) => {
    let statusCode: number;
    let errorCode: string;
    let message: string;
    let details: Record<string, unknown>;
    let cause: unknown;
    let traceId: string | undefined;

    if (isPluginErrorEnvelope(error)) {
      statusCode = error.http || 500;
      errorCode = error.code || 'E_PLUGIN';
      message = error.message || 'Plugin error';
      details = {
        ...(error.details ?? {}),
        pluginId: error.meta.pluginId,
        pluginVersion: error.meta.pluginVersion,
        routeOrCommand: error.meta.routeOrCommand,
        ...(error.trace ? { trace: error.trace } : {}),
      };
      cause = undefined;
      traceId = undefined;
    } else {
      const err = error as Error & { statusCode?: number; code?: string; details?: unknown; cause?: unknown; traceId?: string };
      statusCode = err.statusCode || 500;
      errorCode = err.code || 'E_INTERNAL';
      message = err.message || 'Internal server error';
      details = (err.details as Record<string, unknown>) || {};
      cause = err.cause;
      traceId = err.traceId;
    }

    reply.errorCode = errorCode;

    if (request.kbLogger) {
      request.kbLogger.error('Request error', error instanceof Error ? error : new Error(String(error)), {
        errorCode,
        statusCode,
      });
    }

    const errorEnvelope = errorEnvelopeSchema.parse({
      ok: false,
      error: { code: errorCode, message, details, cause, traceId },
      meta: {
        requestId: request.id,
        durationMs: reply.elapsedTime || 0,
        apiVersion: config.apiVersion,
      },
    });

    reply.status(statusCode).send(errorEnvelope);
  });
}

