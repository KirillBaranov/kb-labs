import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: 'src/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'core/index': 'src/core/index.ts',
    'serializable/index': 'src/serializable/index.ts',
    'noop/index': 'src/noop/index.ts',
    'noop/adapters/index': 'src/noop/adapters/index.ts',
    'noop/core/index': 'src/noop/core/index.ts',
  },
  tsconfig: 'tsconfig.build.json',
  // ✅ Build both ESM and CJS formats for compatibility
  // Required by core-runtime which needs to work in both CJS (CLI bin) and ESM (sandbox) contexts
  format: ['esm', 'cjs'],
});
