import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/manifest.ts'],
  format: ['esm'],
  outDir: 'dist',
  dts: false,
  clean: false,
  sourcemap: false,
  target: 'node20',
});
