import nodePreset from '@kb-labs/devkit/eslint/node.js';

export default [
  { ignores: ['vitest.*.config.*'] },
  ...nodePreset,
];
