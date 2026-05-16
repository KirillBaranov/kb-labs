import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  format: ['esm', 'cjs'],
  entry: {
    index: 'src/index.ts',
  },
  tsconfig: 'tsconfig.build.json',
  dts: {
    resolve: true,
    entry: {
      index: 'src/index.ts',
    },
  },
  external: [
    /^@kb-labs\/.*/,
    'vitest',
    'ws',
    'nanoid',
  ],
});
