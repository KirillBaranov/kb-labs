/**
 * @module @kb-labs/core-sandbox/versioning/context-version
 * Context versioning for compatibility
 */

import type { ExecutionContext } from '../types/index';

/**
 * Current context schema version
 */
export const CURRENT_CONTEXT_VERSION = '1.0.0';

/**
 * Validate context version compatibility
 */
export function validateContextVersion(ctx: ExecutionContext): void {
  if (!ctx.version) {
    throw new Error('Context version is required');
  }
  
  const [major] = ctx.version.split('.');
  const [currentMajor] = CURRENT_CONTEXT_VERSION.split('.');
  
  if (major !== currentMajor) {
    throw new Error(
      `Incompatible context version: ${ctx.version} (runtime expects ${CURRENT_CONTEXT_VERSION})`
    );
  }
}





