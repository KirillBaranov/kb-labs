import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/analyzers/architecture-analyzer.ts',
    'src/analyzers/security-analyzer.ts',
    'src/analyzers/naming-analyzer.ts',
  ],
  external: ['@kb-labs/review-contracts', '@kb-labs/sdk'],
  dts: {
    resolve: true,
    skipLibCheck: true,
  },
  clean: true,
  sourcemap: true,
});
