/**
 * Fastify type extensions for the gateway application.
 * Augments FastifyRequest with gateway-specific per-request fields.
 */

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    kbLogger?: {
      trace(message: string, meta?: Record<string, unknown>): void;
      debug(message: string, meta?: Record<string, unknown>): void;
      info(message: string, meta?: Record<string, unknown>): void;
      warn(message: string, meta?: Record<string, unknown>): void;
      error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
      fatal(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
      child(bindings: Record<string, unknown>): FastifyRequest['kbLogger'];
    };
  }
}
