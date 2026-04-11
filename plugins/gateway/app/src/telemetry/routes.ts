/**
 * @module Telemetry Ingestion — unified event collection endpoint.
 *
 * Exposes `POST /telemetry/v1/ingest` for external products to send events.
 * Events are written to platform analytics via IAnalytics.track().
 * Auth required — tenantId extracted from auth context.
 */
import type { FastifyInstance } from 'fastify';
import { platform } from '@kb-labs/core-runtime';
import type { ILogger } from '@kb-labs/core-platform';
import {
  TelemetryIngestRequestSchema,
  type TelemetryIngestResponse,
} from '@kb-labs/gateway-contracts';

/**
 * Register telemetry ingestion routes on the given Fastify scope.
 * The scope is expected to have the auth middleware already applied.
 */
export function registerTelemetryRoutes(app: FastifyInstance, logger: ILogger): void {
  app.post('/telemetry/v1/ingest', { schema: { tags: ['Telemetry'], summary: 'Ingest telemetry events' } }, async (request, reply) => {
    const auth = request.authContext;
    if (!auth) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const parsed = TelemetryIngestRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Bad Request',
        issues: parsed.error.issues,
      });
    }

    const analytics = platform.analytics;
    if (!analytics) {
      return reply.code(503).send({
        error: 'Analytics adapter not configured',
      });
    }

    const { events } = parsed.data;
    let accepted = 0;
    let rejected = 0;
    const errors: Array<{ index: number; message: string }> = [];

    for (let i = 0; i < events.length; i++) {
      const event = events[i]!;
      try {
        await analytics.track(event.type, {
          // Source attribution — who sent this event
          _source: event.source,
          _tenantId: auth.namespaceId,
          _ts: event.timestamp ?? new Date().toISOString(),
          // Tags as flat properties for indexing
          ...event.tags,
          // Free-form payload
          ...event.payload,
        });
        accepted++;
      } catch (err) {
        rejected++;
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ index: i, message });
        logger.warn('Telemetry event rejected', {
          index: i,
          type: event.type,
          source: event.source,
          error: message,
        });
      }
    }

    logger.info('Telemetry ingest', {
      tenantId: auth.namespaceId,
      accepted,
      rejected,
      totalEvents: events.length,
    });

    const response: TelemetryIngestResponse = {
      accepted,
      rejected,
      ...(errors.length > 0 ? { errors } : {}),
    };

    return reply.code(accepted > 0 ? 200 : 422).send(response);
  });
}
