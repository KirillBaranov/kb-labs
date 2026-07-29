/**
 * @module @kb-labs/rest-api-app/middleware/request-id
 * Request ID generation and correlation middleware
 */

import type { FastifyInstance } from "fastify";
import { ulid } from "ulid";
import { platform } from "@kb-labs/core-runtime";
import { createHttpLogger } from "@kb-labs/shared-http";

// ADDS: request.id, request.kbLogger | SETS REPLY: X-Request-Id, X-Trace-Id
export function registerRequestIdMiddleware(server: FastifyInstance): void {
  server.addHook("onRequest", async (request, reply) => {
    const requestId =
      (request.headers["x-request-id"] as string | undefined) || ulid();
    const traceId =
      (request.headers["x-trace-id"] as string | undefined) || ulid();

    request.id = requestId;
    reply.header("X-Request-Id", requestId);
    reply.header("X-Trace-Id", traceId);

    // Store logger metadata on request for metrics middleware to use
    const logger = createHttpLogger(platform.logger, {
      serviceId: "rest",
      layer: "service",
      component: "http-request",
      requestId,
      traceId,
      method: request.method,
      url: request.url,
      operation: "http.request",
    });

    // Log request received
    request.kbLogger = logger;
    logger.debug("HTTP request started");
  });
}
