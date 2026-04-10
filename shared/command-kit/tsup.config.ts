import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: 'src/index.ts',
    'flags/index': 'src/flags/index.ts',
    'analytics/index': 'src/analytics/index.ts',
    'errors/index': 'src/errors/index.ts',
    'helpers/index': 'src/helpers/index.ts',
    'studio/index': 'src/studio/index.ts',
  },
  tsconfig: 'tsconfig.build.json', // Use build-specific tsconfig without paths
  dts: {
    resolve: true, // Resolve external type declarations
    entry: {
      // Skip studio types due to dependency issues
      index: 'src/index.ts',
      'flags/index': 'src/flags/index.ts',
      'analytics/index': 'src/analytics/index.ts',
      'errors/index': 'src/errors/index.ts',
      'helpers/index': 'src/helpers/index.ts',
    },
  },
  external: [
    /^@kb-labs\/.*/, // All workspace packages - let runtime resolve them
  ],
});

