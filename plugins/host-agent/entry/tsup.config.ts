import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/commands/**/*.ts',
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/host-agent-client',
    '@kb-labs/host-agent-contracts',
    '@kb-labs/host-agent-transport',
  ],
  dts: {
    resolve: false,
    skipLibCheck: true,
  },
  clean: true,
  sourcemap: true,
});
