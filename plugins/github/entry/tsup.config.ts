import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node'

export default defineConfig({
  ...nodePreset,
  tsconfig: 'tsconfig.build.json',
  entry: [
    'src/index.ts',
    'src/manifest.ts',
    'src/handlers/**/*.ts',
  ],
  external: [
    '@kb-labs/sdk',
    '@kb-labs/github-contracts',
  ],
  dts: { resolve: false, skipLibCheck: true },
  clean: true,
  sourcemap: true,
})
