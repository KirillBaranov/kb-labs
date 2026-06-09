import 'fastify';
import type { ILogger } from '@kb-labs/core-platform';

declare module 'fastify' {
  interface FastifyRequest {
    kbLogger?: ILogger;
  }
}
