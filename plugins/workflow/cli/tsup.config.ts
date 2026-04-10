import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/commands/**/*.ts',  // Auto-include all CLI commands
    'src/rest/**/*.ts',      // Auto-include all REST handlers
    'src/ws/**/*.ts',        // Auto-include all WebSocket channels
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/workflow-contracts',
  ],
  dts: {
    resolve: true,
    skipLibCheck: true,
  },
  clean: true,
  sourcemap: true,
});
