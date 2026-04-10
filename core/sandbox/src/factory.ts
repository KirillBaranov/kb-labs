/**
 * @module @kb-labs/core-sandbox/factory
 * Factory for creating sandbox runners
 */

import type { SandboxConfig } from './types/index';
import type { SandboxRunner } from './runner/sandbox-runner';
import { createInProcessRunner } from './runner/inprocess-runner';
import { createSubprocessRunner } from './runner/subprocess-runner';

/**
 * Create a sandbox runner based on configuration
 * @param config - Sandbox configuration
 * @returns Configured sandbox runner
 */
export function createSandboxRunner(config: SandboxConfig): SandboxRunner {
  // devMode is a hint, but inspect mode (subprocess) takes priority
  // If mode is explicitly set to subprocess, don't override it
  const forceInprocess = (config.devMode || process.env.KB_PLUGIN_DEV_MODE === 'true')
    && config.mode !== 'subprocess';

  if (forceInprocess && config.mode === 'inprocess') {
    return createInProcessRunner();
  }

  // Use the specified mode (subprocess has priority for inspect mode)
  switch (config.mode) {
    case 'inprocess':
      return createInProcessRunner();
    case 'subprocess':
      try {
        return createSubprocessRunner(config);
      } catch (error) {
        throw error;
      }
    default:
      throw new Error(`Unknown sandbox mode: ${config.mode}`);
  }
}

