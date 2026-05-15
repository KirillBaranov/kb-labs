/**
 * @module @kb-labs/workflow-engine/manifest-converter
 *
 * Pure conversion utilities for plugin manifest declarations → WorkflowRuntime.
 * No I/O, no caching, no platform dependency — testable in isolation.
 *
 * Used by ManifestScanner which handles fetch + cache responsibilities.
 */

import type {
  WorkflowHandlerDecl,
  JobHandlerDecl,
  CronDecl,
} from '@kb-labs/plugin-contracts';
import type {
  WorkflowRuntime,
  WorkflowSchedule,
} from './manifest-scanner.js';

export class ManifestConverter {
  convertWorkflowHandler(
    pluginId: string,
    handler: WorkflowHandlerDecl,
    pluginRoot: string,
  ): WorkflowRuntime {
    const id = `${pluginId}/${handler.id}`;

    return {
      kind: 'workflow',
      id,
      source: 'manifest',
      pluginId,
      manifestPath: pluginRoot,
      name: handler.describe ?? handler.id,
      description: handler.describe,
      tags: ['plugin', pluginId],
      triggers: [{ type: 'manual' }],
      handler: handler.handler,
      status: 'active',
      permissions: handler.permissions,
      input: handler.input,
      output: handler.output,
    };
  }

  convertJobHandler(
    pluginId: string,
    handler: JobHandlerDecl,
    pluginRoot: string,
  ): WorkflowRuntime {
    const id = `${pluginId}:job:${handler.id}`;

    return {
      kind: 'job',
      id,
      source: 'manifest',
      pluginId,
      manifestPath: pluginRoot,
      name: handler.describe ?? handler.id,
      description: handler.describe,
      tags: ['plugin', 'job', pluginId],
      triggers: [{ type: 'manual' }],
      handler: handler.handler,
      status: 'active',
      permissions: handler.permissions,
      input: handler.input,
      output: handler.output,
    };
  }

  convertCronSchedule(
    pluginId: string,
    cronDecl: CronDecl,
    pluginRoot: string,
  ): WorkflowRuntime {
    const id = `${pluginId}:cron:${cronDecl.id}`;

    const schedule: WorkflowSchedule = {
      cron: cronDecl.schedule,
      enabled: cronDecl.enabled ?? true,
    };

    return {
      kind: 'cron',
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
      handler: undefined,
      schedule,
      status: (cronDecl.enabled ?? true) ? 'active' : 'disabled',
      permissions: cronDecl.permissions,
    };
  }
}
