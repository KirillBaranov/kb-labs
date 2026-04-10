import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node'

export default defineConfig({
  ...nodePreset,
  entry: {
    index: 'src/index.ts',
    'runner/bootstrap': 'src/runner/bootstrap.ts', // Bootstrap for subprocess runner
  },
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  // nodePreset already includes all workspace packages as external via tsup.external.json
})

