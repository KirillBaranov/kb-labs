/**
 * @module @kb-labs/workflow-engine/manifest-scanner
 *
 * Scans plugin manifests for workflows and jobs, converting them to unified WorkflowRuntime format.
 *
 * ## Features
 * - Discovers workflows from `manifest.workflows.handlers`
 * - Discovers jobs from `manifest.jobs`
 * - Converts to unified WorkflowRuntime representation
 * - Caches results via Platform state for performance
 *
 * ## Usage
 * ```typescript
 * const scanner = new ManifestScanner({ cliApi, platform });
 * const workflows = await scanner.scanPlugins();
 * ```
 */

import type { IEntityRegistry } from '@kb-labs/core-registry';
import type {
  WorkflowHandlerDecl,
  JobHandlerDecl,
  CronDecl,
  PlatformServices
} from '@kb-labs/plugin-contracts';

/**
 * Workflow trigger type
 */
export type WorkflowTriggerType = 'manual' | 'webhook' | 'push' | 'schedule' | 'event';

/**
 * Workflow trigger configuration
 */
export interface WorkflowTrigger {
  type: WorkflowTriggerType;
  config?: Record<string, unknown>;
}

/**
 * Schedule configuration for workflows
 */
export interface WorkflowSchedule {
  /** Cron expression (e.g., "0 2 * * *") */
  cron: string;
  /** Whether schedule is enabled */
  enabled: boolean;
  /** Next run time (calculated) */
  nextRun?: Date;
  /** Last run time */
  lastRun?: Date;
}

/**
 * Workflow runtime statistics
 */
export interface WorkflowStats {
  totalRuns: number;
  successRuns: number;
  failedRuns: number;
  lastRunStatus?: 'success' | 'failed' | 'cancelled';
  lastRunAt?: Date;
  avgDurationMs?: number;
}

/**
 * Unified workflow runtime representation.
 *
 * Used for both manifest-based and standalone workflows.
 */
export interface WorkflowRuntime {
  // Identification
  id: string;
  source: 'manifest' | 'standalone' | 'plugin';

  // Manifest-based fields
  pluginId?: string;
  manifestPath?: string;

  // Common metadata
  name: string;
  description?: string;
  tags?: string[];

  // Execution configuration
  triggers: WorkflowTrigger[];
  handler?: string; // For manifest-based workflows

  // Schedule (if applicable)
  schedule?: WorkflowSchedule;

  // Status
  status: 'active' | 'paused' | 'disabled';

  // Statistics (optional, populated from runtime)
  stats?: WorkflowStats;

  // Permissions
  permissions?: unknown; // From manifest

  // Full spec stored for execution (standalone workflows)
  input?: unknown;
  output?: unknown;
  // Declared input parameter schema exposed via REST API
  inputSchema?: Record<string, { type: 'string' | 'number' | 'boolean'; description?: string; required?: boolean; default?: unknown }>;
}

/**
 * Options for ManifestScanner
 */
export interface ManifestScannerOptions {
  /** CLI API instance */
  cliApi: IEntityRegistry;

  /** Platform services (for state, logger, etc.) */
  platform: PlatformServices;

  /** Cache TTL in milliseconds (default: 60000 = 1 minute) */
  cacheTtlMs?: number;
}

/**
 * Manifest Scanner Service
 *
 * Discovers workflows and jobs from installed plugin manifests.
 */
export class ManifestScanner {
  private readonly cliApi: IEntityRegistry;
  private readonly platform: PlatformServices;
  private readonly cacheTtlMs: number;

  constructor(options: ManifestScannerOptions) {
    this.cliApi = options.cliApi;
    this.platform = options.platform;
    this.cacheTtlMs = options.cacheTtlMs ?? 60000; // 1 minute default
  }

  /**
   * Scan all installed plugins for workflows and jobs.
   *
   * Returns unified WorkflowRuntime representations.
   */
  async scanPlugins(): Promise<WorkflowRuntime[]> {
    const cacheKey = 'manifest-scanner:workflows';

    // Check cache first (via platform cache)
    if (this.platform.cache) {
      const cached = await this.platform.cache.get<WorkflowRuntime[]>(cacheKey);
      if (cached) {
        this.platform.logger?.debug('ManifestScanner: Using cached workflows', { count: cached.length });
        return cached;
      }
    }

    this.platform.logger?.debug('ManifestScanner: Querying entity registry');
    const workflows: WorkflowRuntime[] = [];

    // Query workflow, job, and cron entities from registry (extracted from ManifestV3 by catalog)
    const workflowEntities = this.cliApi.queryEntities({ kind: 'workflow' });
    const jobEntities = this.cliApi.queryEntities({ kind: 'job' });
    const cronEntities = this.cliApi.queryEntities({ kind: 'cron' });

    // Get plugin roots for handler path resolution
    const pluginRoots = new Map<string, string>();
    for (const plugin of this.cliApi.listPlugins()) {
      pluginRoots.set(plugin.id, plugin.source.path);
    }

    const allEntities = [
      ...workflowEntities.map(e => ({ entity: e, converter: 'workflow' as const })),
      ...jobEntities.map(e => ({ entity: e, converter: 'job' as const })),
      ...cronEntities.map(e => ({ entity: e, converter: 'cron' as const })),
    ];

    for (const { entity, converter } of allEntities) {
      const root = pluginRoots.get(entity.ref.pluginId);
      if (!root) {
        this.platform.logger?.warn('ManifestScanner: Plugin root not found, skipping entity', {
          pluginId: entity.ref.pluginId,
          entityId: entity.ref.entityId,
          kind: entity.ref.kind,
        });
        continue;
      }

      try {
        if (converter === 'workflow') {
          workflows.push(this.convertWorkflowHandler(entity.ref.pluginId, entity.declaration as any, root));
        } else if (converter === 'job') {
          workflows.push(this.convertJobHandler(entity.ref.pluginId, entity.declaration as any, root));
        } else {
          workflows.push(this.convertCronSchedule(entity.ref.pluginId, entity.declaration as any, root));
        }
      } catch (err) {
        this.platform.logger?.warn('ManifestScanner: Failed to convert entity', {
          pluginId: entity.ref.pluginId,
          entityId: entity.ref.entityId,
          kind: entity.ref.kind,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Scan workflow templates (static YAML files declared in manifest.workflows.templates)
    const snapshot = this.cliApi.snapshot();
    let templatesCount = 0;
    for (const entry of snapshot.manifests ?? []) {
      const templates = (entry.manifest as any).workflows?.templates ?? [];
      for (const templateDecl of templates) {
        const id = `plugin:${entry.pluginId}/${templateDecl.id}`;
        workflows.push({
          id,
          source: 'plugin',
          pluginId: entry.pluginId,
          name: templateDecl.describe ?? templateDecl.id,
          description: templateDecl.describe,
          tags: templateDecl.tags,
          triggers: [{ type: 'manual' }],
          status: 'active',
        });
        templatesCount++;
      }
    }

    this.platform.logger?.info('ManifestScanner: Discovered workflows via registry', {
      count: workflows.length,
      workflows: workflowEntities.length,
      jobs: jobEntities.length,
      crons: cronEntities.length,
      templates: templatesCount,
    });

    // Cache results (via platform cache)
    if (this.platform.cache) {
      await this.platform.cache.set(cacheKey, workflows, this.cacheTtlMs);
    }

    return workflows;
  }

  /**
   * Convert workflow handler declaration to WorkflowRuntime.
   */
  private convertWorkflowHandler(
    pluginId: string,
    handler: WorkflowHandlerDecl,
    pluginRoot: string
  ): WorkflowRuntime {
    const id = `${pluginId}/${handler.id}`;

    return {
      id,
      source: 'manifest',
      pluginId,
      manifestPath: pluginRoot,
      name: handler.describe ?? handler.id,
      description: handler.describe,
      tags: ['plugin', pluginId],
      triggers: [
        { type: 'manual' }, // Workflow handlers can always be triggered manually
      ],
      handler: handler.handler,
      status: 'active',
      permissions: handler.permissions,
      input: handler.input,
      output: handler.output,
    };
  }

  /**
   * Convert job handler declaration to WorkflowRuntime.
   */
  private convertJobHandler(
    pluginId: string,
    handler: JobHandlerDecl,
    pluginRoot: string
  ): WorkflowRuntime {
    const id = `${pluginId}:job:${handler.id}`;

    return {
      id,
      source: 'manifest',
      pluginId,
      manifestPath: pluginRoot,
      name: handler.describe ?? handler.id,
      description: handler.describe,
      tags: ['plugin', 'job', pluginId],
      triggers: [
        { type: 'manual' }, // Job handlers are invoked on-demand via ctx.api.jobs.submit()
      ],
      handler: handler.handler,
      status: 'active',
      permissions: handler.permissions,
      input: handler.input,
      output: handler.output,
    };
  }

  /**
   * Convert cron schedule declaration to WorkflowRuntime.
   */
  private convertCronSchedule(
    pluginId: string,
    cronDecl: CronDecl,
    pluginRoot: string
  ): WorkflowRuntime {
    const id = `${pluginId}:cron:${cronDecl.id}`;

    const schedule: WorkflowSchedule = {
      cron: cronDecl.schedule,
      enabled: cronDecl.enabled ?? true,
    };

    return {
      id,
      source: 'manifest',
      pluginId,
      manifestPath: pluginRoot,
      name: cronDecl.describe ?? cronDecl.id,
      description: cronDecl.describe,
      tags: ['plugin', 'cron', pluginId],
      triggers: [
        {
          type: 'schedule',
          config: { cron: cronDecl.schedule, timezone: cronDecl.timezone },
        },
      ],
      // Note: Cron schedules reference a job type to execute
      // The actual handler path comes from the job declaration
      handler: undefined, // Will be resolved at execution time via job type
      schedule,
      status: (cronDecl.enabled ?? true) ? 'active' : 'disabled',
      permissions: cronDecl.permissions,
    };
  }

  // Legacy convertLegacyJob method removed - use cron schedules instead

  /**
   * Scan all installed plugins for job handlers only.
   *
   * Returns information needed to register handlers in JobManager.
   */
  async scanJobHandlers(): Promise<Array<{
    pluginId: string;
    pluginVersion: string;
    pluginRoot: string;
    handler: JobHandlerDecl;
  }>> {
    const snapshot = this.cliApi.snapshot();
    const jobHandlers: Array<{
      pluginId: string;
      pluginVersion: string;
      pluginRoot: string;
      handler: JobHandlerDecl;
    }> = [];

    for (const entry of snapshot.manifests ?? []) {
      const handlers = entry.manifest.jobs?.handlers ?? [];
      for (const handler of handlers) {
        jobHandlers.push({
          pluginId: entry.pluginId,
          pluginVersion: entry.manifest.version,
          pluginRoot: entry.pluginRoot,
          handler,
        });
      }
    }

    this.platform.logger?.debug('ManifestScanner: Discovered job handlers', {
      count: jobHandlers.length,
    });

    return jobHandlers;
  }

  /**
   * Clear cache (useful for testing or force refresh).
   */
  async clearCache(): Promise<void> {
    if (this.platform.cache) {
      await this.platform.cache.delete('manifest-scanner:workflows');
      this.platform.logger?.debug('ManifestScanner: Cache cleared');
    }
  }

  /**
   * Watch for plugin changes and invalidate cache.
   *
   * @param callback Optional callback when workflows change
   * @returns Unsubscribe function
   */
  watchPlugins(callback?: (workflows: WorkflowRuntime[]) => void): () => void {
    return this.cliApi.onChange(async () => {
      // Invalidate cache on plugin changes
      await this.clearCache();

      // Notify callback
      if (callback) {
        const workflows = await this.scanPlugins();
        callback(workflows);
      }
    });
  }
}
