import { defineConfig } from 'tsup';
import binPreset from '@kb-labs/devkit/tsup/bin';

export default defineConfig({
  ...binPreset,
  sourcemap: false, // Temporary: disable sourcemaps to avoid rollup conflicts
  tsconfig: "tsconfig.build.json",
  entry: {
    bin: 'src/bin.ts',
  },
  // 🧪 EXPERIMENT: Bundle core-runtime instead of externalizing it
  // Testing if singleton pattern still works when core-runtime is bundled.
  // Singleton should work because child processes use IPC/Unix Socket transport,
  // not direct code sharing. If this works, it eliminates the need for workspace symlinks.
  external: [
    ...binPreset.external ?? [],
    // TEMPORARILY COMMENTED: Debug why setupLogPipes not called
    // '@kb-labs/core-sandbox',
    '@kb-labs/plugin-contracts', // V3 plugin contracts - must be external
    // Workflow packages (not built yet - V3 migration pending)
    '@kb-labs/workflow-engine',
    '@kb-labs/workflow-runtime',
    '@kb-labs/workflow-contracts',
    '@kb-labs/workflow-artifacts',
    '@kb-labs/workflow-constants',
  ],
  esbuildPlugins: [
    ...(binPreset.esbuildPlugins ?? []),
    {
      name: 'plugin-contracts-external',
      setup(build) {
        build.onResolve({ filter: /^@kb-labs\/plugin-contracts$/ }, () => {
          return { path: '@kb-labs/plugin-contracts', external: true };
        });
      },
    },
  ],
});
