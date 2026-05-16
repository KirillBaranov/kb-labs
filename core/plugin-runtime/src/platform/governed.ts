/**
 * Governed Platform Services
 *
 * Backward-compatible entry point. All logic lives in pipeline.ts + adapter-registry.ts.
 */

import type { PlatformServices, PermissionSpec } from '@kb-labs/plugin-contracts';
import { applyPluginGovernance } from './pipeline.js';

export { applyPluginGovernance };

/**
 * @deprecated Use applyPluginGovernance() from pipeline.ts directly.
 * Kept for backward compatibility.
 */
export function createGovernedPlatformServices(
  raw: PlatformServices,
  permissions: PermissionSpec,
  pluginId: string,
): PlatformServices {
  return applyPluginGovernance(raw, permissions, pluginId);
}
