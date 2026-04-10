/**
 * ESLint configuration for @kb-labs/studio-ui-kit
 */
import reactPreset from '@kb-labs/devkit/eslint/react.js';

export default [
  ...reactPreset,
  {
    ignores: ['vitest-setup.ts']
  }
];
