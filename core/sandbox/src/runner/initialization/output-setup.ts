/**
 * @module @kb-labs/core-sandbox/runner/initialization/output-setup
 * Setup unified Output for sandbox subprocess
 */

import { createSandboxOutput } from '../../output/index';
import type { Output } from '@kb-labs/core-sys/output';

export interface OutputSetupOptions {
  verbosity?: 'debug' | 'normal' | 'quiet';
  category?: string;
  format?: 'human' | 'ai';
  context?: Record<string, unknown>;
}

/**
 * Create unified Output for sandbox subprocess
 *
 * The Output system handles IPC communication with parent process automatically
 * and provides structured logging capabilities.
 */
export function setupSandboxOutput(options: OutputSetupOptions): Output {
  const {
    verbosity = 'normal',
    category = 'sandbox:bootstrap',
    format = 'human',
    context,
  } = options;

  return createSandboxOutput({
    verbosity,
    category,
    format,
    context,
  });
}
