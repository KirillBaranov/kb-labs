import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json",
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/cli/commands/**/*.ts',
    'src/rest/handlers/**/*.ts',
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/qa-contracts',
    '@kb-labs/qa-core',
  ],
  dts: true,
});
