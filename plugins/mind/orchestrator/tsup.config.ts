import { defineConfig } from 'tsup';

export default defineConfig({
  // Manual config without nodePreset to control bundling
  format: ['esm'],
  target: 'es2022',
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  splitting: false,
  minify: false,
  skipNodeModulesBundle: false, // Allow bundling workspace packages
  shims: false,
  tsconfig: "tsconfig.build.json",
  entry: ['src/index.ts'],
  external: [], // Bundle everything (no externals)
  treeshake: false,
  dts: true,
});
