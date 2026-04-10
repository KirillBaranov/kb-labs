import type { PermissionPreset } from '../types';

/**
 * NPM publish preset - for plugins that publish to npm
 * Includes HOME for ~/.npmrc, npm auth tokens
 */
export const npmPublish: PermissionPreset = {
  id: 'npm-publish',
  description: 'NPM operations - includes HOME, npm tokens, and registry access',
  permissions: {
    env: {
      read: [
        // System (required for npm to find config)
        'HOME',
        'USER',
        'PATH',
        'TMPDIR',
        'LANG',
        'LC_ALL',
        'TZ',
        // NPM-specific
        'NPM_TOKEN',
        'NPM_AUTH_TOKEN',
        'NODE_AUTH_TOKEN',
        'npm_*',           // All npm env vars
        // Node
        'NODE_ENV',
        'NODE_OPTIONS',
      ],
    },
    fs: {
      mode: 'readWrite',
      allow: [
        '**/package.json',
        '**/package-lock.json',
        '**/pnpm-lock.yaml',
        '**/.npmrc',
        '**/.npmignore',
      ],
    },
    network: {
      fetch: [
        'registry.npmjs.org',
        'npm.pkg.github.com',
      ],
    },
  },
};
