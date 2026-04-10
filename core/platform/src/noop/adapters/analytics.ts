/**
 * @module @kb-labs/core-platform/noop/adapters/analytics
 * NoOp analytics implementation.
 */

import type { IAnalytics } from '../../adapters/analytics.js';

/**
 * NoOp analytics - does nothing, safe for testing and development.
 */
export class NoOpAnalytics implements IAnalytics {
  async track(_event: string, _properties?: Record<string, unknown>): Promise<void> {
    // No-op
  }

  async identify(_userId: string, _traits?: Record<string, unknown>): Promise<void> {
    // No-op
  }

  async flush(): Promise<void> {
    // No-op
  }
}
