import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: "src/index.ts",
    "gateway/index": "src/gateway/index.ts",
    "v3/index": "src/v3/index.ts",
  },
  tsconfig: "tsconfig.build.json",
});
