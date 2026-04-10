import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json",
  entry: {
    index: 'src/index.ts',
    'sandbox/index': 'src/sandbox/index.ts',
    'sandbox/bootstrap': 'src/sandbox/bootstrap.ts',
  },
  // Override external to bundle plugin-contracts-v3 into bootstrap
  // Bootstrap needs to be standalone when forked as subprocess (no access to node_modules)
  external: [
    // Bundle @kb-labs/plugin-contracts and @kb-labs/shared-cli-ui (remove from external list)
    // Keep only Node.js built-ins external
    /^node:/,
    // Keep 'fs' external for sync fallback support
    'fs',
  ],
  noExternal: [
    '@kb-labs/plugin-contracts', // Explicitly bundle this
    '@kb-labs/shared-cli-ui', // Explicitly bundle this (needed for bootstrap)
  ],
})
