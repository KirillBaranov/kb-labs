import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/cli/commands/**/*.ts',
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/devlink-contracts',
    '@kb-labs/devlink-core',
  ],
  dts: true,
  clean: true,
  sourcemap: true,
});
