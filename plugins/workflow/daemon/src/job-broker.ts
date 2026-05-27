/**
 * @module @kb-labs/workflow-daemon/job-broker
 * JobBroker implementation - facade for background job operations
 * Specification: kb-labs-mind/docs/adr/0034-job-broker-cron-scheduler.md
 */

import type { WorkflowEngine } from '@kb-labs/workflow-engine';
import type { WorkflowRun, WorkflowSpec } from '@kb-labs/workflow-contracts';
import type { ILogger, LogLevel } from '@kb-labs/core-platform';
import type { PlatformContainer } from '@kb-labs/core-runtime';

export interface SubmitJobRequest {
  handler: string;
  input?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  metadata?: Record<string, unknown>;
}

/**
 * JobBroker - Facade for workflow engine operations.
 * Converts job requests to WorkflowSpec and delegates to WorkflowEngine.
 */
export class JobBroker {
  constructor(
    private readonly engine: WorkflowEngine,
    private readonly logger: ILogger,
    private readonly platform: PlatformContainer,
  ) {}

  /**
   * Submit a background job for execution.
   * Creates a WorkflowSpec with a single job and submits to WorkflowEngine.
   */
  async submit(request: SubmitJobRequest): Promise<WorkflowRun> {
    this.logger.info('Submitting background job', {
      handler: request.handler,
      priority: request.priority ?? 'normal',
    });

    // Convert to WorkflowSpec
    // Handler can be in format:
    // - "command:name" for CLI commands (e.g., "command:mind:rag-index")
    // - "plugin:id/handler" for workflow handlers
    // - "builtin:shell" for shell execution
    // If no prefix, assume it's a CLI command for backward compatibility
    const uses = request.handler.includes(':')
      ? request.handler
      : `command:${request.handler}`;

    const spec: WorkflowSpec = {
      name: `job-${request.handler}`,
      version: '1.0.0',
      on: { manual: true },
      jobs: {
        main: {
          runsOn: 'local',
          steps: [
            {
              id: 'execute',
              name: 'Execute handler',
              uses,
              with: request.input ?? {},
            },
          ],
        },
      },
    };

    const run = await this.engine.runFromInline(spec, {
      trigger: { type: 'manual' as const },
      env: {},
      metadata: request.metadata,
    });

    this.logger.info('Background job submitted', {
      runId: run.id,
      handler: request.handler,
      status: run.status,
    });

    return run;
  }

  /**
   * Get job status by run ID.
   */
  async getStatus(runId: string): Promise<WorkflowRun | null> {
    return this.engine.getRun(runId);
  }

  /**
   * Cancel a running job.
   */
  async cancel(runId: string): Promise<void> {
    await this.engine.cancelRun(runId);
    this.logger.info('Job cancelled', { runId });
  }

  /**
   * Query logs for a specific run, with optional step-level filtering.
   * Used by GET /api/v1/runs/:runId/logs?stepId=...
   */
  async getRunLogs(
    runId: string,
    options?: { stepId?: string; limit?: number; offset?: number; level?: string },
  ): Promise<Array<{ timestamp: string; level: string; message: string; context?: Record<string, unknown> }>> {
    return this._queryLogs(runId, options);
  }

  /**
   * Get job logs by run ID.
   * Returns execution logs with optional filtering by level and pagination.
   * Uses platform.logs service to query logs by runId metadata.
   */
  async getJobLogs(
    runId: string,
    options?: { limit?: number; offset?: number; level?: string },
  ): Promise<Array<{ timestamp: string; level: string; message: string; context?: Record<string, unknown> }>> {
    return this._queryLogs(runId, options);
  }

  /**
   * Internal: query + filter logs for a given run (optionally narrow to one step).
   */
  private async _queryLogs(
    runId: string,
    options?: { stepId?: string; limit?: number; offset?: number; level?: string },
  ): Promise<Array<{ timestamp: string; level: string; message: string; context?: Record<string, unknown> }>> {
    const run = await this.engine.getRun(runId);

    if (!run) {
      return [];
    }

    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;

    // Calculate time window of the run
    const startTime = run.startedAt
      ? new Date(run.startedAt).getTime()
      : Date.now() - 3_600_000; // 1-hour fallback
    const endTime = run.finishedAt ? new Date(run.finishedAt).getTime() : Date.now();

    // Query a wide batch from the log store (in-memory adapter keeps everything)
    const queryResult = await this.platform.logs.query(
      {
        from: startTime,
        to: endTime,
        level: options?.level && options.level !== 'all' ? options.level as LogLevel : undefined,
      },
      {
        limit: 2000,
        offset: 0,
      },
    );

    type LogEntry = {
      timestamp: number;
      level: string;
      message: string;
      fields: Record<string, unknown>;
    };

    // Filter by runId, then optionally by stepId.
    // queryResult.logs may be null/undefined when the log adapter returns an
    // empty result set (e.g. noop adapter in worker-pool mode) — guard with ??.
    const filtered = ((queryResult.logs ?? []) as LogEntry[]).filter((log) => {
      // Guard against malformed entries with missing fields object.
      if (!log.fields) {return false;}
      if (log.fields['runId'] !== runId) {
        return false;
      }
      if (options?.stepId && log.fields['stepId'] !== options.stepId) {
        return false;
      }
      return true;
    });

    // Sort chronologically (oldest first — natural reading order)
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    // Paginate
    const page = filtered.slice(offset, offset + limit);

    return page.map((log) => ({
      timestamp: new Date(log.timestamp).toISOString(),
      level: log.level,
      message: log.message,
      context: log.fields,
    }));
  }
}
