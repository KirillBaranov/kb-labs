import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/commands/**/*.ts',  // Auto-include all CLI commands
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/review-contracts',
    '@kb-labs/review-core',
    '@kb-labs/review-heuristic',
  ],
  dts: {
    resolve: true,
    skipLibCheck: true,
  },
  clean: true,
  sourcemap: true,
});
