/**
 * @module @kb-labs/rest-api-app/middleware/mock-mode
 * Mock mode middleware (per-request)
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import type { IncomingHttpHeaders } from 'http';

type MockableRequest = {
  headers: IncomingHttpHeaders;
  mockMode?: boolean;
};

/**
 * Check if mock mode should be enabled for this request
 */
export function isMockModeEnabled(
  request: MockableRequest,
  config: RestApiConfig
): boolean {
  // Check per-request header
  const headerMock = request.headers['kb-mock'];
  if (headerMock === 'true' || headerMock === '1') {
    return true;
  }

  // Check global config
  return config.mockMode || false;
}

/**
 * Register mock mode middleware
 */
export function registerMockModeMiddleware(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  server.addHook('onRequest', async (request) => {
    const mockableRequest = request as MockableRequest;
    mockableRequest.mockMode = isMockModeEnabled(mockableRequest, config);
  });
}

