#!/usr/bin/env node
import { build } from 'esbuild';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

console.log('🔨 Building CLI binary with esbuild...\n');

try {
  const result = await build({
    entryPoints: ['src/bin.ts'],
    outfile: 'dist/bin.mjs',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',

    // Add shebang
    banner: {
      js: '#!/usr/bin/env node'
    },

    // Sourcemaps for debugging
    sourcemap: true,

    // CRITICAL: Only externalize Node.js built-ins and native modules
    // Everything else (workspace packages, node_modules) gets bundled
    external: [
      'fsevents', // Native module (can't be bundled)
      'yaml', // Has dynamic require('process') issue in ESM
    ],

    // Minify to reduce size (optional - disable for easier debugging)
    minify: false,

    // Tree-shaking to remove unused code
    treeShaking: true,

    // Show bundle size and warnings
    metafile: true,
    logLevel: 'info',

    // Resolve conditions (prefer ESM)
    conditions: ['node', 'import'],
  });

  // Show bundle size
  const outFileStats = result.metafile?.outputs?.['dist/bin.mjs'];
  if (outFileStats) {
    const sizeKB = (outFileStats.bytes / 1024).toFixed(2);
    console.log(`\n✅ CLI binary built successfully!`);
    console.log(`📦 Bundle size: ${sizeKB} KB`);
    console.log(`📄 Output: dist/bin.mjs\n`);
  }
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
