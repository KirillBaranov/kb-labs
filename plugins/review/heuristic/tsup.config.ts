import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: ['src/index.ts'],
  dts: true,
  // Keep necessary external deps (eslint and glob are not workspace packages)
  external: [
    ...nodePreset.external,
    'eslint',
    'glob',
  ],
});
