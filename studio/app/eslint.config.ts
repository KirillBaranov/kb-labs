import reactPreset from '@kb-labs/devkit/eslint/react.js';
import noDirectAntdImport from './eslint-rules/no-direct-antd-import.js';

export default [
  ...reactPreset,
  {
    ignores: ['dist/**', 'coverage/**', 'eslint-rules/**', '.__mf__temp/**', '*.mjs']
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'studio-rules': {
        rules: { 'no-direct-antd-import': noDirectAntdImport },
      },
    },
    rules: {
      'studio-rules/no-direct-antd-import': 'error',
    },
  },
  {
    // Low-level UI wrappers are allowed to import directly from antd / @ant-design
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}'],
    rules: {
      'studio-rules/no-direct-antd-import': 'off',
    },
  },
];
