import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: ['src/index.ts', 'src/contract.ts', 'src/schema.ts'],
  dts: {
    resolve: true,
    skipLibCheck: true,
  },
  treeshake: false,
});
