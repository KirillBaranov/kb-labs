import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: ['src/index.ts'],
  dts: true,
  // Keep necessary external deps (glob is not workspace package)
  external: [
    ...nodePreset.external,
    'glob',
  ],
});
