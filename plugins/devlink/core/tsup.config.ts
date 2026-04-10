import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: ['src/index.ts'],
  external: [
    '@kb-labs/devlink-contracts',
    'js-yaml',
  ],
  dts: true,
  clean: true,
  sourcemap: true,
});
