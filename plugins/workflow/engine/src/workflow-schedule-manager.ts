/**
 * @module @kb-labs/workflow-engine/workflow-schedule-manager
 *
 * Manages scheduled workflow execution via CronManager.
 *
 * ## Features
 * - Registers scheduled workflows with CronManager
 * - Executes workflows on cron triggers
 * - Tracks next/last run times
 * - Supports both manifest-based jobs and standalone workflows
 *
 * ## Usage
 * ```typescript
 * const scheduleManager = new WorkflowScheduleManager({
 *   cronManager,
 *   workflowService,
 *   executor,
 *   platform,
 * });
 *
 * await scheduleManager.registerAll();
 * ```
 */

import type { ICronManager, CronExpression } from '@kb-labs/core-platform';
import type { PlatformServices } from '@kb-labs/plugin-contracts';
import type { WorkflowService } from './workflow-service';
import type { WorkflowRuntime } from './manifest-scanner';

/**
 * Workflow executor interface.
 * Executes workflows (will be implemented by workflow engine).
 */
export interface WorkflowExecutor {
  /**
   * Execute workflow by ID.
   */
  execute(request: {
    workflowId: string;
    trigger: 'manual' | 'schedule' | 'webhook' | 'push';
    input?: Record<string, unknown>;
  }): Promise<{ runId: string }>;
}

/**
 * Options for WorkflowScheduleManager
 */
export interface WorkflowScheduleManagerOptions {
  /** CronManager instance */
  cronManager: ICronManager;

  /** WorkflowService for discovering workflows */
  workflowService: WorkflowService;

  /** Workflow executor */
  executor: WorkflowExecutor;

  /** Platform services */
  platform: PlatformServices;
}

/**
 * Workflow Schedule Manager
 *
 * Integrates workflows with CronManager for scheduled execution.
 */
export class WorkflowScheduleManager {
  private readonly cronManager: ICronManager;
  private readonly workflowService: WorkflowService;
  private readonly executor: WorkflowExecutor;
  private readonly platform: PlatformServices;

  constructor(options: WorkflowScheduleManagerOptions) {
    this.cronManager = options.cronManager;
    this.workflowService = options.workflowService;
    this.executor = options.executor;
    this.platform = options.platform;
  }

  /**
   * Register all scheduled workflows with CronManager.
   *
   * Scans both manifest-based jobs and standalone workflows with schedules.
   */
  async registerAll(): Promise<void> {
    const workflows = await this.workflowService.listAll();

    const scheduled = workflows.filter(
      (w) => w.schedule && w.schedule.enabled && w.status === 'active'
    );

    this.platform.logger?.info('WorkflowScheduleManager: Registering scheduled workflows', {
      total: workflows.length,
      scheduled: scheduled.length,
    });

    // Register all workflows in parallel
    await Promise.all(scheduled.map(workflow => this.register(workflow)));
  }

  /**
   * Register single workflow schedule.
   */
  async register(workflow: WorkflowRuntime): Promise<void> {
    if (!workflow.schedule || !workflow.schedule.enabled) {
      this.platform.logger?.warn('WorkflowScheduleManager: Cannot register workflow without schedule', {
        id: workflow.id,
      });
      return;
    }

    const cronId = this.getCronId(workflow.id);
    const schedule = workflow.schedule.cron as CronExpression;

    this.cronManager.register(cronId, schedule, async (context) => {
      this.platform.logger?.info('WorkflowScheduleManager: Executing scheduled workflow', {
        workflowId: workflow.id,
        workflowName: workflow.name,
        runCount: context.runCount,
      });

      try {
        const result = await this.executor.execute({
          workflowId: workflow.id,
          trigger: 'schedule',
          input: {},
        });

        this.platform.logger?.info('WorkflowScheduleManager: Workflow execution started', {
          workflowId: workflow.id,
          runId: result.runId,
        });
      } catch (error) {
        this.platform.logger?.error(
          'WorkflowScheduleManager: Workflow execution failed',
          error instanceof Error ? error : undefined,
          {
            workflowId: workflow.id,
            workflowName: workflow.name,
          }
        );
      }
    });

    this.platform.logger?.debug('WorkflowScheduleManager: Registered workflow', {
      workflowId: workflow.id,
      schedule: schedule,
    });
  }

  /**
   * Unregister workflow schedule.
   */
  async unregister(workflowId: string): Promise<void> {
    const cronId = this.getCronId(workflowId);
    this.cronManager.unregister(cronId);

    this.platform.logger?.debug('WorkflowScheduleManager: Unregistered workflow', {
      workflowId,
    });
  }

  /**
   * Re-register all schedules (refresh).
   *
   * Useful after workflow changes or service restart.
   */
  async refresh(): Promise<void> {
    // Unregister all workflow cron jobs
    const allJobs = this.cronManager.list();
    for (const job of allJobs) {
      if (job.id.startsWith('workflow:')) {
        this.cronManager.unregister(job.id);
      }
    }

    // Re-register all
    await this.registerAll();

    this.platform.logger?.info('WorkflowScheduleManager: Refreshed all schedules');
  }

  /**
   * Get next run time for scheduled workflow.
   */
  getNextRun(workflowId: string): Date | null {
    const cronId = this.getCronId(workflowId);
    const job = this.cronManager.list().find((j) => j.id === cronId);
    return job?.nextRun ?? null;
  }

  /**
   * Get last run time for scheduled workflow.
   */
  getLastRun(workflowId: string): Date | null {
    const cronId = this.getCronId(workflowId);
    const job = this.cronManager.list().find((j) => j.id === cronId);
    return job?.lastRun ?? null;
  }

  /**
   * Pause scheduled workflow.
   */
  pause(workflowId: string): void {
    const cronId = this.getCronId(workflowId);
    this.cronManager.pause(cronId);

    this.platform.logger?.info('WorkflowScheduleManager: Paused workflow schedule', {
      workflowId,
    });
  }

  /**
   * Resume paused workflow schedule.
   */
  resume(workflowId: string): void {
    const cronId = this.getCronId(workflowId);
    this.cronManager.resume(cronId);

    this.platform.logger?.info('WorkflowScheduleManager: Resumed workflow schedule', {
      workflowId,
    });
  }

  /**
   * List all scheduled workflows.
   */
  listScheduled(): Array<{
    workflowId: string;
    schedule: string;
    status: 'active' | 'paused';
    lastRun?: Date;
    nextRun?: Date;
    runCount: number;
  }> {
    return this.cronManager
      .list()
      .filter((job) => job.id.startsWith('workflow:'))
      .map((job) => ({
        workflowId: this.getWorkflowId(job.id),
        schedule: job.schedule,
        status: job.status,
        lastRun: job.lastRun,
        nextRun: job.nextRun,
        runCount: job.runCount,
      }));
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private getCronId(workflowId: string): string {
    return `workflow:${workflowId}`;
  }

  private getWorkflowId(cronId: string): string {
    return cronId.replace('workflow:', '');
  }
}
