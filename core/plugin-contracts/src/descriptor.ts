/**
 * Plugin Context Descriptor for V3 Plugin System
 *
 * This is a JSON-serializable structure passed via IPC from parent to child process.
 * It contains all the DATA needed to create a full PluginContextV3 in the sandbox.
 *
 * IMPORTANT: This does NOT contain functions - only data that can be JSON.stringify'd.
 */

import type { HostType, HostContext } from './host-context.js';
import type { PermissionSpec } from './permissions.js';

/**
 * Plugin context descriptor.
 */
export interface PluginContextDescriptor {
  hostType: HostType;
  hostContext: HostContext;
  permissions: PermissionSpec;
  pluginId: string;
  pluginVersion: string;
  handlerId?: string;
  requestId: string;
  tenantId?: string;
  /** Config section from manifest (for useConfig auto-detection) */
  configSection?: string;
}
