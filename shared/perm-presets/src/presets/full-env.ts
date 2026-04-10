import type { PermissionPreset } from '../types';

/**
 * Full environment preset - access to all environment variables
 * Use for trusted plugins that need full system access
 * WARNING: This bypasses env filtering entirely
 */
export const fullEnv: PermissionPreset = {
  id: 'full-env',
  description: 'Full environment access - all env vars available (trusted plugins only)',
  permissions: {
    env: {
      read: ['*'], // Wildcard - all env vars
    },
  },
};
