import type { ExecutionTarget } from '@kb-labs/plugin-contracts';

interface AnalyticsLike {
  track(event: string, properties?: Record<string, unknown>): Promise<void>;
}

interface EventBusLike {
  publish<T>(topic: string, event: T): Promise<void>;
}

interface LoggerLike {
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface TargetExecutionAuditEvent {
  method: 'invoke' | 'workflow';
  sourcePluginId: string;
  sourceHandlerId?: string;
  tenantId?: string;
  target: ExecutionTarget;
  targetPluginId?: string;
  workflowId?: string;
}

export interface TargetExecutionAuditSinks {
  analytics?: AnalyticsLike;
  eventBus?: EventBusLike;
  logger?: LoggerLike;
}

const ANALYTICS_EVENT = 'plugin.target_execution.requested';
const EVENT_BUS_TOPIC = 'plugin.target-execution.requested';

export async function emitTargetExecutionAudit(
  sinks: TargetExecutionAuditSinks,
  event: TargetExecutionAuditEvent
): Promise<void> {
  if (!event.target.namespace) {
    return;
  }

  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    method: event.method,
    sourcePluginId: event.sourcePluginId,
    sourceHandlerId: event.sourceHandlerId,
    tenantId: event.tenantId,
    targetPluginId: event.targetPluginId,
    workflowId: event.workflowId,
    target: event.target,
  };

  const tasks: Array<Promise<unknown>> = [];

  if (sinks.analytics) {
    tasks.push(sinks.analytics.track(ANALYTICS_EVENT, payload));
  }

  if (sinks.eventBus) {
    tasks.push(sinks.eventBus.publish(EVENT_BUS_TOPIC, payload));
  }

  if (tasks.length === 0) {
    return;
  }

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') {
      sinks.logger?.warn?.('Target execution audit sink failed', {
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        method: event.method,
        sourcePluginId: event.sourcePluginId,
      });
    }
  }
}
