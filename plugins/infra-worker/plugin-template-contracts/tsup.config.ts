import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: ['src/index.ts', 'src/schema.ts', 'src/contract.ts'],
  dts: {
    resolve: true,
    skipLibCheck: true
  },
  clean: true,
  sourcemap: true
});

