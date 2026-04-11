/**
 * @module @kb-labs/rest-api-app/routes/hello
 * Hello service endpoint — simple liveness / greeting check
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { HelloResponse } from '@kb-labs/rest-api-contracts';
import { normalizeBasePath } from '../utils/path-helpers';

/**
 * Register hello routes
 *
 * GET /api/v1/hello
 *   Returns a greeting message together with the current server timestamp.
 *   Useful as a lightweight smoke-test that the REST API is reachable.
 */
export async function registerHelloRoutes(
  fastify: FastifyInstance,
  config: RestApiConfig
): Promise<void> {
  const basePath = normalizeBasePath(config.basePath);

  /**
   * GET /hello
   * Returns { schema, message, ts } wrapped in a SuccessEnvelope.
   */
  fastify.get(`${basePath}/hello`, async (request, reply) => {
    const start = Date.now();

    const response: HelloResponse = {
      ok: true,
      data: {
        schema: 'kb.hello/1',
        message: 'Hello from KB Labs REST API!',
        ts: new Date().toISOString(),
      },
      meta: {
        requestId: request.id as string,
        durationMs: Date.now() - start,
        apiVersion: '1.0.0',
      },
    };

    return reply.code(200).send(response);
  });
}
