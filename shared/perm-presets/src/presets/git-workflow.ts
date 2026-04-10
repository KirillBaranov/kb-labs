import type { PermissionPreset } from '../types';

/**
 * Git workflow preset - for plugins that use git (simple-git, etc.)
 * Includes HOME for ~/.gitconfig, USER for author info
 */
export const gitWorkflow: PermissionPreset = {
  id: 'git-workflow',
  description: 'Git operations - includes HOME, USER, and git config access',
  permissions: {
    env: {
      read: [
        // System (required for git to find config)
        'HOME',
        'USER',
        'PATH',
        'SHELL',
        'TERM',
        'LANG',
        'LC_ALL',
        'TZ',
        'TMPDIR',
        // Git-specific
        'GIT_*',           // All git env vars (GIT_AUTHOR_NAME, GIT_DIR, etc.)
        'SSH_AUTH_SOCK',   // For SSH key auth
        'SSH_AGENT_PID',
        // Node
        'NODE_ENV',
      ],
    },
    fs: {
      mode: 'readWrite',
      allow: [
        '**/.git/**',      // Git directory
        '**/.gitignore',
        '**/.gitattributes',
      ],
    },
  },
};
