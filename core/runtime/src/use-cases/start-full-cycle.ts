/**
 * @module @kb-labs/core-runtime/use-cases/start-full-cycle
 * Unified one-click full-cycle entrypoint.
 */

import type { RunRecord } from '@kb-labs/core-platform';
import type { PlatformContainer } from '../container.js';
import type { StartFullCycleRequest } from '../run-orchestrator.js';

/**
 * Start full-cycle run through configured run orchestrator.
 */
export async function startFullCycle(
  platform: Pick<PlatformContainer, 'runOrchestrator'>,
  request: StartFullCycleRequest
): Promise<RunRecord> {
  return platform.runOrchestrator.startFullCycle(request);
}

