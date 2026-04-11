/**
 * @module @kb-labs/rest-api-app/middleware/cache
 * Cache middleware for ETag/Last-Modified support
 */

import type { FastifyInstance } from 'fastify';
import { createHash } from 'crypto';

/**
 * Generate ETag from content
 */
export function generateETag(content: string | Buffer | object): string {
  const contentStr = typeof content === 'object' ? JSON.stringify(content) : content.toString();
  const hash = createHash('sha256').update(contentStr).digest('hex');
  return `"${hash.substring(0, 16)}"`; // Short hash for ETag
}

/**
 * Register cache middleware
 */
export function registerCacheMiddleware(server: FastifyInstance): void {
  server.addHook('onSend', async (request, reply, payload) => {
    // Only cache successful GET requests
    if (request.method !== 'GET' || reply.statusCode >= 300) {
      return payload;
    }

    // Skip cache for streaming responses
    if (reply.getHeader('content-type') === 'text/event-stream') {
      return payload;
    }

    // Check If-None-Match header (ETag)
    const ifNoneMatch = request.headers['if-none-match'];
    if (ifNoneMatch && payload) {
      const payloadStr = typeof payload === 'object' ? JSON.stringify(payload) : String(payload);
      const etag = generateETag(payloadStr);
      
      if (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`) {
        reply.code(304).header('ETag', etag);
        return undefined; // Not Modified
      }
      
      reply.header('ETag', etag);
    }

    // Check If-Modified-Since header (Last-Modified)
    const ifModifiedSince = request.headers['if-modified-since'];
    if (ifModifiedSince && payload) {
      // For now, we'll use finishedAt from job metadata if available
      // This is a simplified implementation - in production, use actual modification time
      const lastModified = new Date().toUTCString();
      reply.header('Last-Modified', lastModified);
      
      const ifModifiedSinceDate = new Date(ifModifiedSince);
      const lastModifiedDate = new Date(lastModified);
      
      if (lastModifiedDate <= ifModifiedSinceDate) {
        reply.code(304);
        return undefined; // Not Modified
      }
    }

    return payload;
  });
}

