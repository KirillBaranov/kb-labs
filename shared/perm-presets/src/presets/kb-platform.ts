import type { PermissionPreset } from '../types';

/**
 * KB Platform preset - for KB Labs internal plugins
 * Includes KB_* env vars and .kb/ directory access
 */
export const kbPlatform: PermissionPreset = {
  id: 'kb-platform',
  description: 'KB Labs platform access - KB_* env vars and .kb/ directory',
  permissions: {
    env: {
      read: [
        // System basics
        'HOME',
        'USER',
        'PATH',
        'TMPDIR',
        'NODE_ENV',
        // KB Labs specific
        'KB_*',            // All KB env vars
      ],
    },
    fs: {
      mode: 'readWrite',
      allow: [
        '.kb/**',          // KB Labs config directory
      ],
    },
  },
};
