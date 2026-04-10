import type { PermissionPreset } from '../types';

/**
 * Minimal preset - only basic Node.js environment
 * Use when plugin doesn't need any external access
 */
export const minimal: PermissionPreset = {
  id: 'minimal',
  description: 'Minimal permissions - basic Node.js environment only',
  permissions: {
    env: {
      read: [
        'NODE_ENV',
        'PATH',
        'LANG',
        'LC_ALL',
        'TZ',
      ],
    },
  },
};
