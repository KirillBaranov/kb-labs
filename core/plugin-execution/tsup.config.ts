import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: {
    index: 'src/index.ts',
    'http/index': 'src/http/index.ts',
    'ws/index': 'src/ws/index.ts',
  },
  external: ['fastify'],
});
