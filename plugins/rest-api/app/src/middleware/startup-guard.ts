/**
 * @module @kb-labs/rest-api-app/middleware/startup-guard
 * Guard to prevent request storms during startup
 */

import type { FastifyInstance } from 'fastify';
import type { RestApiConfig } from '@kb-labs/rest-api-core';
import { isReady } from '../routes/readiness';

type StartupCounters = {
  inFlight: number;
};

type StartupConfig = {
  maxConcurrent?: number;
  queueLimit?: number;
  timeoutMs?: number;
  retryAfterSeconds?: number;
};

export function registerStartupGuard(
  server: FastifyInstance,
  config: RestApiConfig
): void {
  const startupConfig = (config as RestApiConfig & { startup?: StartupConfig }).startup;
  if (!startupConfig) {
    return;
  }

  const counters: StartupCounters = {
    inFlight: 0,
  };

  server.kbStartupGuard = counters;

  const maxConcurrent = startupConfig.maxConcurrent ?? 32;
  const queueLimit = startupConfig.queueLimit ?? 128;
  const timeoutMs = startupConfig.timeoutMs ?? 5000;
  const retryAfterSeconds = startupConfig.retryAfterSeconds ?? 2;

  server.addHook('onRequest', (request, reply, done) => {
    const readiness = server.kbReadiness;
    const infraReady = readiness ? isReady(readiness) : false;

    if (infraReady) {
      done();
      return;
    }

    if (counters.inFlight >= queueLimit) {
      reply
        .code(503)
        .header('Retry-After', retryAfterSeconds.toString())
        .send({
          schema: 'kb.startup/1',
          status: 'initializing',
          reason: 'startup_queue_limit',
          maxConcurrent,
          queueLimit,
        });
      return;
    }

    counters.inFlight += 1;
    request.kbStartupGuardActive = true;

    const timer = setTimeout(() => {
      if (!reply.sent) {
        reply
          .code(504)
          .header('Retry-After', retryAfterSeconds.toString())
          .send({
            schema: 'kb.startup/1',
            status: 'timeout',
            reason: 'startup_timeout',
            timeoutMs,
          });
      }
    }, timeoutMs);
    timer.unref();
    request.kbStartupGuardTimer = timer;

    if (counters.inFlight > maxConcurrent) {
      if ((request as any).kbLogger) {
        (request as any).kbLogger.warn('Startup guard concurrency threshold exceeded', {
          inFlight: counters.inFlight,
          maxConcurrent,
        });
      }
    }

    done();
  });

  server.addHook('onResponse', (request, _reply, done) => {
    if (request.kbStartupGuardActive) {
      counters.inFlight = Math.max(0, counters.inFlight - 1);
      if (request.kbStartupGuardTimer) {
        clearTimeout(request.kbStartupGuardTimer);
        request.kbStartupGuardTimer = undefined;
      }
      request.kbStartupGuardActive = false;
    }
    done();
  });
}

