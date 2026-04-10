import { defineConfig } from 'tsup';
import dualPreset from '@kb-labs/devkit/tsup/dual';

export default defineConfig({
  ...dualPreset,
  entry: {
    index: "src/index.ts",
    debug: "src/debug/index.ts",
  },
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
});
