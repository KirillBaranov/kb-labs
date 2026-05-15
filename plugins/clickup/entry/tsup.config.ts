import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/commands/**/*.ts',
    'src/rest/handlers/**/*.ts',
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/clickup-core',
    '@kb-labs/clickup-contracts',
  ],
  dts: {
    resolve: false,
    skipLibCheck: true,
  },
  clean: true,
  sourcemap: true,
});
