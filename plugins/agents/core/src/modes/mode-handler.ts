/**
 * Mode handler interface and base implementation
 */

import type { TaskResult, ModeConfig, AgentConfig } from '@kb-labs/agent-contracts';
import type { ToolRegistry } from '@kb-labs/agent-tools';

/**
 * Mode handler interface - each mode implements this
 */
export interface ModeHandler {
  /**
   * Execute task in this mode
   */
  execute(task: string, config: AgentConfig, toolRegistry: ToolRegistry): Promise<TaskResult>;
}

/**
 * Get mode handler for specified mode.
 * Delegates to ModeRegistry — supports built-in and custom modes.
 */
export async function getModeHandler(modeConfig?: ModeConfig): Promise<ModeHandler> {
  const mode = modeConfig?.mode || 'execute';
  const { modeRegistry } = await import('./mode-registry.js');
  return modeRegistry.get(mode);
}
