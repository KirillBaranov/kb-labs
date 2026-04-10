import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'es2022',
  jsx: 'preserve',
  sourcemap: true,
  clean: true,
  dts: true,
  treeshake: true,
  minify: false,
  outDir: 'dist',
  splitting: false,
  skipNodeModulesBundle: true,
  shims: false,
  ignoreWatch: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
  ],
})

