import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';
import globby from 'globby';

export default defineConfig({
  ...nodePreset,
  entry: [
    'src/index.ts',
    ...globby.sync('src/templates/builtin/*.ts'),
  ],
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  // nodePreset already includes all workspace packages as external via tsup.external.json
});


