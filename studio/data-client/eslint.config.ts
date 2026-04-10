import reactPreset from '@kb-labs/devkit/eslint/react.js';

export default [
  ...reactPreset,
  {
    ignores: ['dist/**', 'coverage/**']
  }
];

