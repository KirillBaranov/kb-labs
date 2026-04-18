import { defineConfig } from 'tsup'
import nodePreset from '@kb-labs/devkit/tsup/node'

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json",
  entry: {
    index: 'src/index.ts',
    'command/index': 'src/command/index.ts',
    'manifest/index': 'src/manifest/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'hooks/index': 'src/hooks/index.ts',
    'contracts/index': 'src/contracts/index.ts',
    'types/index': 'src/types/index.ts',
    'testing/index': 'src/testing/index.ts',
    'studio/index': 'src/studio/index.ts',
    'studio-build/index': 'src/studio-build/index.ts',
    'platform/index': 'src/platform/index.ts',
  },
  // Bundle shared-command-kit into SDK so its types are self-contained.
  // Consumers get CommandHandler, CLIInput etc. directly from @kb-labs/sdk
  // without needing a reference to the internal shared-command-kit package.
  noExternal: ['@kb-labs/shared-command-kit'],
  dts: { resolve: true },
  rollupOptions: {
    onwarn(warning, warn) {
      // Suppress unused external import warnings that arise from bundling
      // shared-command-kit — rollup sees re-exported symbols as unused after
      // treeshaking but they are part of the public API surface.
      if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
      warn(warning);
    },
  },
});
