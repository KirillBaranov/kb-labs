import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/analyzer/index.ts',
    'src/generator/index.ts',
    'src/applier/index.ts',
    'src/storage/index.ts',
  ],
  dts: {
    resolve: true,
    skipLibCheck: true,
  },
  clean: true,
  sourcemap: true,
  external: ['@kb-labs/commit-contracts', '@kb-labs/sdk'],
});
