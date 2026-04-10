/**
 * @module @kb-labs/plugin-execution/workspace/types
 *
 * Workspace manager interface.
 */

import type { WorkspaceConfig } from '../types.js';

/**
 * Workspace manager - abstraction for workspace lifecycle.
 *
 * Implementations:
 * - LocalWorkspaceManager: Returns paths as-is (Level 0/1)
 * - EphemeralWorkspaceManager: Git clone/worktree (Level 2)
 */
export interface WorkspaceManager {
  /**
   * Lease workspace for execution.
   * Returns materialized paths for handler resolution.
   */
  lease(
    config: WorkspaceConfig | undefined,
    ctx: WorkspaceLeaseContext
  ): Promise<WorkspaceLease>;

  /**
   * Release workspace after execution.
   * Cleanup resources, remove ephemeral directories.
   */
  release(lease: WorkspaceLease): Promise<void>;
}

/**
 * Context for workspace lease.
 */
export interface WorkspaceLeaseContext {
  /** Execution ID for tracing */
  executionId: string;

  /** Plugin root from descriptor */
  pluginRoot: string;
}

/**
 * Workspace lease - materialized workspace info.
 */
export interface WorkspaceLease {
  /** Unique workspace ID */
  workspaceId: string;

  /** Materialized cwd (where to execute) */
  cwd: string;

  /** Materialized plugin root (for handler resolution) */
  pluginRoot: string;

  /** Cleanup function (called by release) */
  cleanup?: () => Promise<void>;
}
