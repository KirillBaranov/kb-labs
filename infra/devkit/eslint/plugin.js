/**
 * Strict ESLint preset for KB Labs plugins.
 *
 * Extends the base node.js preset with architectural boundary enforcement:
 * plugins can only import from @kb-labs/sdk and their own internal packages.
 *
 * Usage in plugin's eslint.config.js:
 *   import pluginPreset from '@kb-labs/devkit/eslint/plugin.js';
 *   export default [...pluginPreset];
 */

import nodePreset from './node.js'

// Packages that plugins are allowed to import from
const ALLOWED_EXTERNAL = [
  '@kb-labs/sdk',
]

// Platform internals that plugins must NOT import directly
const FORBIDDEN_PATTERNS = [
  '@kb-labs/core-*',
  '@kb-labs/cli-*',
  '@kb-labs/shared-*',
  '@kb-labs/plugin-*',
  '@kb-labs/workflow-*',
  '@kb-labs/rest-api-*',
  '@kb-labs/studio-*',
  '@kb-labs/adapters-*',
  '@kb-labs/gateway-*',
  '@kb-labs/host-agent-*',
  '@kb-labs/state-*',
  '@kb-labs/tenant',
  '@kb-labs/perm-*',
]

export default [
  ...nodePreset,

  {
    rules: {
      'no-restricted-imports': ['error', {
        patterns: FORBIDDEN_PATTERNS.map(pattern => ({
          group: [pattern],
          message: `Plugins must depend only on @kb-labs/sdk. Direct imports from platform internals are not allowed. Re-export what you need through SDK.`,
        })),
      }],
    },
  },
]

export { ALLOWED_EXTERNAL, FORBIDDEN_PATTERNS }
