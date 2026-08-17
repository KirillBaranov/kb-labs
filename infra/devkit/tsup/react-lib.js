import { defineConfig } from 'tsup'
import { cssModulesPlugin } from './css-modules-plugin.js'

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
  // esbuild has no built-in CSS Modules support (`import styles from './x.module.css'`
  // otherwise resolves to `{}`) — see css-modules-plugin.js for why and how this
  // matches the Studio host's Rspack CSS Modules convention.
  esbuildPlugins: [cssModulesPlugin()],
  ignoreWatch: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
  ],
})

