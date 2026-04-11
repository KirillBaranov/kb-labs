/**
 * @module @kb-labs/rest-api-app/middleware/security-headers
 * Security headers middleware
 */

import type { FastifyInstance } from 'fastify';

/**
 * Register security headers middleware
 */
export function registerSecurityHeadersMiddleware(server: FastifyInstance): void {
  server.addHook('onRequest', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

    if (request.protocol === 'https') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  });
}

