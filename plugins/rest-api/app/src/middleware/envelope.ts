/**
 * @module @kb-labs/rest-api-app/middleware/envelope
 * Response envelope wrapper middleware
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { errorEnvelopeSchema } from '@kb-labs/rest-api-contracts';

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

    // Skip if payload is not a string (Buffer or Stream)
    if (typeof payload !== 'string') {
      return payload;
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

  // Error handler
  server.setErrorHandler(async (error: Error & { statusCode?: number; code?: string; details?: unknown; cause?: unknown; traceId?: string }, request, reply) => {
    const statusCode = error.statusCode || 500;

    // Extract error details
    const errorCode = error.code || 'E_INTERNAL';
    const message = error.message || 'Internal server error';
    const details = error.details || {};
    const cause = error.cause;
    const traceId = error.traceId;

    // Store error code for metrics
    reply.errorCode = errorCode;

    // Log error with correlation ID
    if (request.kbLogger) {
      request.kbLogger.error('Request error', error, {
        errorCode,
        statusCode,
      });
    }

    const errorEnvelope = errorEnvelopeSchema.parse({
      ok: false,
      error: {
        code: errorCode,
        message,
        details,
        cause,
        traceId,
      },
      meta: {
        requestId: request.id,
        durationMs: reply.elapsedTime || 0,
        apiVersion: config.apiVersion,
      },
    });

    reply.status(statusCode);
    return errorEnvelope;
  });
}

