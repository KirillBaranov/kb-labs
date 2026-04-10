import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json",
  entry: [
    'src/index.ts',
    'src/runner/index.ts',
    'src/baseline/index.ts',
    'src/history/index.ts',
    'src/report/index.ts',
    'src/categories/index.ts',
  ],
  dts: true,
});
