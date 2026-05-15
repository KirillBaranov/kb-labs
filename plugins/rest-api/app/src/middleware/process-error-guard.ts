/**
 * @module @kb-labs/rest-api-app/middleware/process-error-guard
 * Process-level error guard: catches uncaught exceptions and unhandled rejections.
 * Request-level error formatting is handled by envelope middleware.
 */

import type { FastifyInstance } from 'fastify';
import { platform } from '@kb-labs/core-runtime';

// NOT a request hook — installs process.on('uncaughtException', 'unhandledRejection')
export function registerProcessErrorGuard(server: FastifyInstance): void {
  // Keep a reference to server so the signature stays compatible,
  // but request errors are handled by envelope.ts setErrorHandler.
  void server;

  process.on('uncaughtException', (error: Error) => {
    platform.logger.fatal('Uncaught exception', error, { source: 'process-error-guard' });
  });

  process.on('unhandledRejection', (reason: unknown) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    platform.logger.error('Unhandled rejection', error, { source: 'process-error-guard' });
  });
}
