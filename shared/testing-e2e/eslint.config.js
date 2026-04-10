import nodePreset from '@kb-labs/devkit/eslint/node.js';

export default [
  ...nodePreset,

  // Test helpers use server.close(() => resolve()) pattern inside Promise constructors
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-promise-executor-return': 'off',
    },
  },
];
