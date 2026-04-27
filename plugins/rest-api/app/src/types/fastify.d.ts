/**
 * @module @kb-labs/rest-api-app/types/fastify
 * Fastify type extensions
 */

import type { FastifyBaseLogger } from 'fastify/types/logger';
import type { FastifySchema } from 'fastify/types/schema';
import type { FastifyTypeProvider, FastifyTypeProviderDefault } from 'fastify/types/type-provider';
import type { ContextConfigDefault, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerBase, RawServerDefault } from 'fastify/types/utils';
import type { IEntityRegistry } from '@kb-labs/core-registry';
import type { ReadinessState } from '../routes/readiness';
import '@fastify/type-provider-typebox';
import type { EventHub } from '../events/hub';

declare module 'fastify/types/instance' {
  interface FastifyInstance<
    RawServer extends RawServerBase = RawServerDefault,
    RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
    RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
    Logger extends FastifyBaseLogger = FastifyBaseLogger,
    TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
    SchemaCompiler extends FastifySchema = FastifySchema,
    ContextConfig = ContextConfigDefault
  > {
    registry?: IEntityRegistry;
    kbReadiness?: ReadinessState;
    kbStartupGuard?: {
      inFlight: number;
    };
    kbEventHub?: EventHub;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    registry?: IEntityRegistry;
    kbReadiness?: ReadinessState;
    kbStartupGuard?: {
      inFlight: number;
    };
    kbEventHub?: EventHub;
    kbPluginMountPromise?: Promise<void>;
    listening?: boolean;
  }
}

declare module 'fastify/types/request' {
  interface FastifyRequest {
    mockMode?: boolean;
    kbStartupGuardActive?: boolean;
    kbStartupGuardTimer?: NodeJS.Timeout;
    kbMetricsStart?: number;
    kbHeaderState?: {
      vary: Set<string>;
      sensitive: Set<string>;
      rateLimitKeys: Record<string, string>;
      sanitized: Record<string, string>;
    };
    kbLogger?: {
      trace(message: string, meta?: Record<string, unknown>): void;
      debug(message: string, meta?: Record<string, unknown>): void;
      info(message: string, meta?: Record<string, unknown>): void;
      warn(message: string, meta?: Record<string, unknown>): void;
      error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
      fatal(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void;
      child(bindings: Record<string, unknown>): FastifyRequest['kbLogger'];
    };
    kbPluginId?: string;
    tenantId?: string;
  }
}

declare module 'fastify' {
  interface FastifyReply {
    errorCode?: string;
  }
  interface FastifyRequest {
    tenantId?: string;
  }
}
