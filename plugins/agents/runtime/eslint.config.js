import nodePreset from '@kb-labs/devkit/eslint/node.js';

export default [
  ...nodePreset,
  // Tests import src/ of sibling packages directly — relative paths without extensions
  {
    files: ['src/**/__tests__/**', 'src/**/*.test.ts'],
    rules: { 'import/extensions': 'off' },
  },
];
