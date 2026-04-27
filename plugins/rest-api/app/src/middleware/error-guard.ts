/**
 * @module @kb-labs/rest-api-app/middleware/error-guard
 * Global error guard for plugin routes
 */

import type { FastifyInstance } from 'fastify';
import type { PluginErrorEnvelope } from '@kb-labs/rest-api-contracts';
import { ErrorCode } from '@kb-labs/rest-api-contracts';
import { platform } from '@kb-labs/core-runtime';

/**
 * Register global error handler for plugin routes
 * Never crashes the API - all errors are converted to ErrorEnvelope
 */
export function registerErrorGuard(server: FastifyInstance): void {
  // Global error handler
  server.setErrorHandler((error: unknown, request, reply) => {
    // Handle plugin errors (already ErrorEnvelope)
    if (
      error &&
      typeof error === 'object' &&
      'status' in error &&
      error.status === 'error' &&
      'meta' in error &&
      error.meta &&
      typeof error.meta === 'object' &&
      'pluginId' in error.meta
    ) {
      const envelope = error as unknown as PluginErrorEnvelope;
      reply.status(envelope.http).send(envelope);
      return;
    }

    // Generic error - convert to PluginErrorEnvelope
    const requestId = (request.id as string) || 'unknown';
    const err = error instanceof Error ? error : new Error(String(error));
    const errWithStatus = error as { statusCode?: number };
    const envelope: PluginErrorEnvelope = {
      status: 'error',
      http: errWithStatus.statusCode || 500,
      code: ErrorCode.INTERNAL,
      message: err.message || 'Internal server error',
      details: {
        error: err.message || String(error),
      },
      trace: err.stack,
      meta: {
        requestId,
        pluginId: 'system',
        pluginVersion: 'unknown',
        routeOrCommand: request.url || 'unknown',
        timeMs: 0,
      },
    };

    reply.status(envelope.http).send(envelope);
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    platform.logger.fatal('Uncaught exception', error, { source: 'error-guard' });
    // Don't exit - let Fastify handle it
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    platform.logger.error('Unhandled rejection', error, { source: 'error-guard' });
    // Don't exit - let Fastify handle it
  });
}
