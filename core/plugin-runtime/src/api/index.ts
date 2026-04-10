/**
 * Plugin API implementations
 */

import type {
  PluginAPI,
  CleanupFn,
  CacheAdapter,
  PermissionSpec,
  EnvironmentCreateRequest,
  EnvironmentInfo,
  EnvironmentStatusInfo,
  EnvironmentLeaseInfo,
  WorkspaceMaterializeRequest,
  WorkspaceInfo,
  WorkspaceAttachRequest,
  WorkspaceAttachmentInfo,
  WorkspaceStatusInfo,
  SnapshotCaptureRequest,
  SnapshotInfo,
  SnapshotRestoreRequest,
  SnapshotRestoreInfo,
  SnapshotStatusInfo,
  SnapshotGarbageCollectRequest,
  SnapshotGarbageCollectInfo,
} from '@kb-labs/plugin-contracts';
import type { IWorkflowEngine } from '@kb-labs/core-platform';

import { createLifecycleAPI } from './lifecycle.js';
import { createStateAPI } from './state.js';
import { createArtifactsAPI } from './artifacts.js';
import { createShellAPI } from './shell.js';
import { createEventsAPI, createNoopEventsAPI, type EventEmitterFn } from './events.js';
import { createInvokeAPI, createNoopInvokeAPI, type PluginInvokerFn } from './invoke.js';
import { createWorkflowsAPI, createNoopWorkflowsAPI } from './workflows.js';
import { createJobsAPI, createNoopJobsAPI } from './jobs.js';
import { createCronAPI, createNoopCronAPI } from './cron.js';
import { createEnvironmentAPI, createNoopEnvironmentAPI } from './environment.js';
import { createWorkspaceAPI, createNoopWorkspaceAPI } from './workspace.js';
import { createSnapshotAPI, createNoopSnapshotAPI } from './snapshot.js';
import { emitTargetExecutionAudit } from './target-audit.js';

// Re-export individual APIs
export { createLifecycleAPI, executeCleanup } from './lifecycle.js';
export { createStateAPI } from './state.js';
export { createArtifactsAPI } from './artifacts.js';
export { createShellAPI } from './shell.js';
export { createEventsAPI, createNoopEventsAPI } from './events.js';
export { createInvokeAPI, createNoopInvokeAPI } from './invoke.js';
export { createWorkflowsAPI, createNoopWorkflowsAPI } from './workflows.js';
export { createJobsAPI, createNoopJobsAPI } from './jobs.js';
export { createCronAPI, createNoopCronAPI } from './cron.js';
export { createEnvironmentAPI, createNoopEnvironmentAPI } from './environment.js';
export { createWorkspaceAPI, createNoopWorkspaceAPI } from './workspace.js';
export { createSnapshotAPI, createNoopSnapshotAPI } from './snapshot.js';
export { emitTargetExecutionAudit } from './target-audit.js';
export type { EventEmitterFn } from './events.js';
export type { PluginInvokerFn } from './invoke.js';

export interface CreatePluginAPIOptions {
  pluginId: string;
  handlerId?: string;
  tenantId?: string;
  cwd: string;
  outdir: string;
  permissions: PermissionSpec;
  cache: CacheAdapter;
  eventEmitter?: EventEmitterFn;
  pluginInvoker?: PluginInvokerFn;
  workflowEngine?: IWorkflowEngine;
  /**
   * Workflow Service base URL for Jobs/Cron HTTP APIs
   * @example "http://localhost:3000"
   */
  workflowServiceUrl?: string;
  /**
   * Environment manager facade for long-lived environment lifecycle operations.
   */
  environmentManager?: {
    createEnvironment(request: EnvironmentCreateRequest): Promise<EnvironmentInfo>;
    getEnvironmentStatus(environmentId: string): Promise<EnvironmentStatusInfo>;
    destroyEnvironment(environmentId: string, reason?: string): Promise<void>;
    renewEnvironmentLease(environmentId: string, ttlMs: number): Promise<EnvironmentLeaseInfo>;
  };
  /**
   * Workspace manager facade for workspace lifecycle operations.
   */
  workspaceManager?: {
    materializeWorkspace(request: WorkspaceMaterializeRequest): Promise<WorkspaceInfo>;
    attachWorkspace(request: WorkspaceAttachRequest): Promise<WorkspaceAttachmentInfo>;
    releaseWorkspace(workspaceId: string, environmentId?: string): Promise<void>;
    getWorkspaceStatus(workspaceId: string): Promise<WorkspaceStatusInfo>;
  };
  /**
   * Snapshot manager facade for snapshot lifecycle operations.
   */
  snapshotManager?: {
    captureSnapshot(request: SnapshotCaptureRequest): Promise<SnapshotInfo>;
    restoreSnapshot(request: SnapshotRestoreRequest): Promise<SnapshotRestoreInfo>;
    getSnapshotStatus(snapshotId: string): Promise<SnapshotStatusInfo>;
    deleteSnapshot(snapshotId: string): Promise<void>;
    garbageCollectSnapshots(request?: SnapshotGarbageCollectRequest): Promise<SnapshotGarbageCollectInfo>;
  };
  analytics?: {
    track(event: string, properties?: Record<string, unknown>): Promise<void>;
  };
  eventBus?: {
    publish<T>(topic: string, event: T): Promise<void>;
  };
  logger?: {
    debug?: (message: string, meta?: Record<string, unknown>) => void;
    warn?: (message: string, meta?: Record<string, unknown>) => void;
  };
  cleanupStack: Array<CleanupFn>;
}

/**
 * Create the complete PluginAPI
 */
export function createPluginAPI(options: CreatePluginAPIOptions): PluginAPI {
  const {
    pluginId,
    handlerId,
    tenantId,
    cwd,
    outdir,
    permissions,
    cache,
    eventEmitter,
    pluginInvoker,
    workflowEngine,
    workflowServiceUrl,
    environmentManager,
    workspaceManager,
    snapshotManager,
    analytics,
    eventBus,
    logger,
    cleanupStack,
  } = options;

  return {
    lifecycle: createLifecycleAPI(cleanupStack),
    state: createStateAPI({ pluginId, tenantId, cache }),
    artifacts: createArtifactsAPI({ outdir }),
    shell: createShellAPI({ permissions, cwd }),
    events: eventEmitter
      ? createEventsAPI({ pluginId, emitter: eventEmitter })
      : createNoopEventsAPI(),
    invoke: pluginInvoker
      ? createInvokeAPI({
          permissions,
          invoker: pluginInvoker,
          auditTargetExecution: async ({ method, target, targetPluginId }) => {
            await emitTargetExecutionAudit(
              {
                analytics,
                eventBus,
                logger,
              },
              {
                method,
                sourcePluginId: pluginId,
                sourceHandlerId: handlerId,
                tenantId,
                target,
                targetPluginId,
              }
            );
          },
        })
      : createNoopInvokeAPI(),
    workflows: workflowEngine
      ? createWorkflowsAPI({
          tenantId,
          engine: workflowEngine,
          permissions,
          auditTargetExecution: async ({ method, target, workflowId }) => {
            await emitTargetExecutionAudit(
              {
                analytics,
                eventBus,
                logger,
              },
              {
                method,
                sourcePluginId: pluginId,
                sourceHandlerId: handlerId,
                tenantId,
                target,
                workflowId,
              }
            );
          },
        })
      : createNoopWorkflowsAPI(),
    jobs: workflowServiceUrl
      ? createJobsAPI({ tenantId, workflowServiceUrl, permissions })
      : createNoopJobsAPI(),
    cron: workflowServiceUrl
      ? createCronAPI({ tenantId, workflowServiceUrl, permissions })
      : createNoopCronAPI(),
    environment: environmentManager
      ? createEnvironmentAPI({ permissions, manager: environmentManager })
      : createNoopEnvironmentAPI(),
    workspace: workspaceManager
      ? createWorkspaceAPI({ permissions, manager: workspaceManager })
      : createNoopWorkspaceAPI(),
    snapshot: snapshotManager
      ? createSnapshotAPI({ permissions, manager: snapshotManager })
      : createNoopSnapshotAPI(),
  };
}
