/**
 * @module @kb-labs/plugin-contracts/logger-metadata
 * Extract logger metadata from host context for observability
 */

import type { HostContext } from './host-context';

/**
 * Extract logger metadata from host context
 *
 * This function enriches logger context with host-specific observability data:
 * - REST: requestId, traceId, tenantId, method, url
 * - CLI: argv
 * - Workflow: workflowId, runId, stepId, attempt
 * - Webhook: event, source
 * - Cron: cronId, schedule, scheduledAt
 *
 * @param hostContext - Host context (discriminated union)
 * @returns Logger metadata fields
 *
 * @example
 * ```typescript
 * // In context-factory.ts
 * const meta = getLoggerMetadataFromHost(descriptor.hostContext);
 * const logger = platform.logger.child(meta);
 * ```
 *
 * @example
 * ```typescript
 * // In middleware (manual enrichment)
 * const meta = getLoggerMetadataFromHost({
 *   host: 'rest',
 *   requestId: 'req-123',
 *   traceId: 'trace-456',
 *   // ...
 * });
 * platform.logger.child(meta).info('Request started');
 * ```
 */
export function getLoggerMetadataFromHost(hostContext: HostContext): Record<string, unknown> {
  const base = { layer: hostContext.host };

  switch (hostContext.host) {
    case 'rest':
      return {
        ...base,
        reqId: hostContext.requestId,
        traceId: hostContext.traceId,
        tenantId: hostContext.tenantId,
        method: hostContext.method,
        url: hostContext.path,
      };

    case 'cli':
      return {
        ...base,
        argv: hostContext.argv,
      };

    case 'workflow':
      return {
        ...base,
        workflowId: hostContext.workflowId,
        runId: hostContext.runId,
        jobId: hostContext.jobId,
        stepId: hostContext.stepId,
        attempt: hostContext.attempt,
      };

    case 'webhook':
      return {
        ...base,
        event: hostContext.event,
        source: hostContext.source,
      };

    case 'cron':
      return {
        ...base,
        cronId: hostContext.cronId,
        schedule: hostContext.schedule,
        scheduledAt: hostContext.scheduledAt,
        lastRunAt: hostContext.lastRunAt,
      };

    case 'ws':
      return {
        ...base,
        reqId: hostContext.requestId,
        traceId: hostContext.traceId,
        tenantId: hostContext.tenantId,
        connectionId: hostContext.connectionId,
        channelPath: hostContext.channelPath,
      };
  }
}
