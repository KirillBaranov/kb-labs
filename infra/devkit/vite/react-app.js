import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Vite config factory for React SPA applications
 * @param {object} options - Configuration options
 * @param {string} [options.entry='index.html'] - Entry HTML file
 * @param {string} [options.outDir='dist'] - Output directory
 * @returns {import('vite').UserConfig} Vite configuration
 */
export default function createReactAppConfig(options = {}) {
  const {
    entry = 'index.html',
    outDir = 'dist',
    root = process.cwd(),
  } = options

  return defineConfig({
    root,
    publicDir: 'public',
    build: {
      outDir,
      sourcemap: true,
      minify: false,
      target: 'es2022',
    },
    plugins: [
      react({
        jsxRuntime: 'automatic',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src'),
      },
    },
    server: {
      port: 3000,
      open: false,
    },
    preview: {
      port: 3000,
    },
  })
}

// Export a default config for convenience
export { defineConfig }

