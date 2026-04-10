/**
 * @module @kb-labs/plugin-execution/workspace/local
 *
 * Local workspace manager - trivial implementation for Level 0/1.
 * Returns paths as-is, no cleanup needed.
 */

import type { WorkspaceConfig } from '../types.js';
import type { WorkspaceManager, WorkspaceLeaseContext, WorkspaceLease } from './types.js';

/**
 * Local workspace manager.
 * Simply returns cwd and pluginRoot as-is.
 */
export class LocalWorkspaceManager implements WorkspaceManager {
  async lease(
    config: WorkspaceConfig | undefined,
    ctx: WorkspaceLeaseContext
  ): Promise<WorkspaceLease> {
    return {
      workspaceId: `local_${ctx.executionId}`,
      cwd: config?.cwd ?? process.cwd(),
      pluginRoot: ctx.pluginRoot,
      // No cleanup needed for local workspace
    };
  }

  async release(_lease: WorkspaceLease): Promise<void> {
    // No-op for local workspace
  }
}

/**
 * Singleton instance.
 */
export const localWorkspaceManager = new LocalWorkspaceManager();
