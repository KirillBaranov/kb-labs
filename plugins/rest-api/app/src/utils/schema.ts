/**
 * @module @kb-labs/rest-api-app/utils/schema
 * Schema utilities for Fastify routes.
 * Route-level Zod schemas live in @kb-labs/rest-api-contracts/route-schemas.
 */

/**
 * Error response schema for Fastify's built-in error serialization.
 * Used in non-Zod routes (health, metrics, internal).
 */
export const errorSchema = {
  type: 'object',
  properties: {
    statusCode: { type: 'number' },
    error: { type: 'string' },
    message: { type: 'string' },
    code: { type: 'string' },
  },
  additionalProperties: true,
} as const;
