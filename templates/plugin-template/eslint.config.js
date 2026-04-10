/**
 * Plugin ESLint configuration
 *
 * Uses the strict plugin preset from @kb-labs/devkit.
 * Enforces architectural boundaries: plugins can only import from @kb-labs/sdk.
 *
 * DO NOT modify this file locally - it is synced from @kb-labs/devkit
 *
 * @see https://github.com/kb-labs/devkit#eslint-configuration
 */
import pluginPreset from '@kb-labs/devkit/eslint/plugin.js';

export default [
  ...pluginPreset,
];
