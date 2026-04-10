import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/manifest.v3.ts',
    'src/cli/commands/check.ts',
    'src/cli/commands/packages.ts',
    'src/cli/commands/docs.ts',
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/impact-contracts',
  ],
  dts: true,
  clean: true,
  sourcemap: true,
});
