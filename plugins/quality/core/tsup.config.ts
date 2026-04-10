import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/stats/index.ts',
    'src/health/index.ts',
    'src/dependencies/index.ts',
    'src/build-order/index.ts',
    'src/graph/index.ts',
    'src/stale/index.ts',
    'src/builds/index.ts',
    'src/types/index.ts',
    'src/tests/index.ts',
    'src/dead-code/index.ts',
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/quality-contracts',
  ],
  dts: true,
});
