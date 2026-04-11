/**
 * @module @kb-labs/rest-api-app/plugins
 * Fastify plugins registration
 */

import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyBaseLogger,
  RawServerDefault,
  FastifyTypeProviderDefault,
} from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import fastifyCors, { type FastifyCorsOptions } from '@fastify/cors';
import fastifyRateLimit, { type RateLimitPluginOptions } from '@fastify/rate-limit';
import { registerOpenAPI } from '@kb-labs/shared-http';

/**
 * Register all Fastify plugins
 */
export async function registerPlugins(
  server: FastifyInstance,
  config: RestApiConfig
): Promise<void> {
  // CORS plugin with profile support
  const corsProfile = config.cors.profile || 'dev';
  let corsOrigins: string[] | boolean = config.cors.origins;
  
  if (corsProfile === 'dev') {
    // Dev: allow localhost origins
    corsOrigins = config.cors.origins.length > 0 
      ? config.cors.origins 
      : ['http://localhost:3000', 'http://localhost:5173']; // Vite default + Studio
  } else if (corsProfile === 'preview') {
    // Preview: specific staging domains
    corsOrigins = config.cors.origins.length > 0 
      ? config.cors.origins 
      : false; // Disable if not configured
  } else if (corsProfile === 'prod') {
    // Prod: strict whitelist
    corsOrigins = config.cors.origins.length > 0 
      ? config.cors.origins 
      : false; // Disable if not configured
  }

  const corsOptions: FastifyCorsOptions = {
    origin: corsOrigins,
    credentials: config.cors.allowCredentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'X-Request-Id', 
      'X-Trace-Id',  // Added for Studio widget tracing
      'Idempotency-Key', 
      'X-Client-Version'
    ],
    exposedHeaders: ['X-Request-Id', 'X-Schema-Version', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    preflightContinue: false,
  };

  const corsPlugin: FastifyPluginCallback<
    FastifyCorsOptions,
    RawServerDefault,
    FastifyTypeProviderDefault,
    FastifyBaseLogger
  > = fastifyCors;

  await server.register(corsPlugin, corsOptions);

  // Add Vary: Origin header for CORS caching
  server.addHook('onSend', async (request, reply) => {
    if (corsProfile !== 'prod') {
      try {
        if (!reply.raw.headersSent) {
          reply.header('Vary', 'Origin');
        }
      } catch (err) {
        // Headers already sent, ignore
      }
    }
  });

  // Rate limit plugin
  if (config.rateLimit) {
    const rateLimitOpts: RateLimitPluginOptions = {
      max: config.rateLimit.max,
      timeWindow: config.rateLimit.timeWindow,
      addHeaders: {
        'x-ratelimit-limit': true,
        'x-ratelimit-remaining': true,
        'x-ratelimit-reset': true,
      },
    };

    const rateLimitPlugin: FastifyPluginCallback<
      RateLimitPluginOptions,
      RawServerDefault,
      FastifyTypeProviderDefault,
      FastifyBaseLogger
    > = fastifyRateLimit;

    await server.register(rateLimitPlugin, rateLimitOpts);
  }

  // OpenAPI / Swagger UI
  // Must be registered after other plugins and before routes.
  // Spec is at /openapi.json — canonical across all services.
  // UI is disabled in production (hideUntagged: true keeps internal routes invisible).
  await registerOpenAPI(server, {
    title: 'KB Labs REST API',
    description: 'Main platform REST API — jobs, workflows, plugins, adapters',
    version: '1.0.0',
    servers: [{ url: 'http://localhost:5050', description: 'Local dev' }],
    ui: corsProfile !== 'prod',
  });
}

