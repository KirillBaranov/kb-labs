import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: 'src/index.ts',
  },
  tsconfig: 'tsconfig.build.json',
  // ✅ Build both ESM and CJS formats for compatibility with both:
  // - ESM imports from sandbox worker (import { initPlatform } from '@kb-labs/core-runtime')
  // - CJS requires from CLI bin (require('@kb-labs/core-runtime'))
  // This ensures the singleton pattern works: both processes load the same module,
  // sharing the same globalThis and platform instance.
  format: ['esm', 'cjs'],
});
