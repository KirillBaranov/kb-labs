import { defineConfig } from 'tsup'
import dualPreset from '@kb-labs/devkit/tsup/dual'

export default defineConfig({
  ...dualPreset,
  entry: {
    index: 'src/index.ts',
  },
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  // dualPreset already includes all workspace packages as external via tsup.external.json
})
