/**
 * @module @kb-labs/rest-api-app/utils/sse-auth
 * Helpers for SSE token validation
 */

import type { FastifyReply, FastifyRequest, HookHandlerDoneFunction } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';

type RegistryAuthConfig = {
  token: string;
  headerName: string;
  queryParam: string;
};

function extractTokenFromHeader(headerValue: unknown, headerName: string): string | undefined {
  if (typeof headerValue === 'string') {
    if (headerName === 'authorization') {
      const match = headerValue.match(/^Bearer\s+(.+)$/i);
      return match ? match[1] : undefined;
    }
    return headerValue;
  }
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }
  return undefined;
}

function extractToken(request: FastifyRequest, config: RegistryAuthConfig): string | undefined {
  const headerName = (config.headerName ?? 'authorization').toLowerCase();
  const queryParam = config.queryParam ?? 'access_token';

  const explicitHeader = extractTokenFromHeader(request.headers[headerName], headerName);
  if (explicitHeader) {
    return explicitHeader;
  }

  if (headerName !== 'authorization' && typeof request.headers.authorization === 'string') {
    const fallback = extractTokenFromHeader(request.headers.authorization, 'authorization');
    if (fallback) {
      return fallback;
    }
  }

  const query = request.query as Record<string, string | undefined>;
  return query?.[queryParam] ?? query?.access_token;
}

export function buildRegistrySseAuthHook(config: RestApiConfig) {
  const registryAuth = config.events?.registry;
  if (!registryAuth?.token) {
    return undefined;
  }
  const authConfig: RegistryAuthConfig = {
    token: registryAuth.token,
    headerName: registryAuth.headerName ?? 'authorization',
    queryParam: registryAuth.queryParam ?? 'access_token',
  };

  return function registrySseAuthHook(
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ) {
    const provided = extractToken(request, authConfig);
    if (provided === authConfig.token) {
      done();
      return;
    }

    reply
      .code(401)
      .header('content-type', 'application/json')
      .send({
        status: 'unauthorized',
        reason: 'invalid_token',
      });
  };
}


