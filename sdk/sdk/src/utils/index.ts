/**
 * Shared utilities
 */

import type {
  HostContext,
  PluginContextV3,
} from '@kb-labs/plugin-contracts';

/**
 * Type-safe helper to extract host context type
 */
export type ExtractHostContext<T extends string> = Extract<
  HostContext,
  { host: T }
>;

/**
 * Type-safe helper to narrow plugin context by host type
 */
export type ContextForHost<T extends string, TConfig = unknown> = Omit<
  PluginContextV3<TConfig>,
  'hostContext'
> & {
  hostContext: ExtractHostContext<T>;
};
