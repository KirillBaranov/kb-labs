import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
  },
  tsconfig: 'tsconfig.build.json',
  dts: {
    resolve: true,
    entry: {
      index: 'src/index.ts',
      cli: 'src/cli.ts',
    },
  },
  external: [
    /^@kb-labs\/.*/,
    'vitest',
    'ws',
    'nanoid',
  ],
});
