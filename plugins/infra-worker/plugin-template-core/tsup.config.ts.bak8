import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node.js';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  entry: [
    'src/index.ts',
    'src/manifest.v2.ts',
    'src/manifest.v3.ts',         // V3 manifest
    // 'src/lifecycle/setup.ts', // TODO: Lifecycle SDK not available yet
    'src/cli/commands/run.ts',
    'src/cli/commands/hello.ts',  // V3 hello command
    'src/cli/commands/test-loader.ts',
    'src/cli/commands/hello-v3.ts',
    'src/rest/handlers/hello-handler.ts',
    'src/rest/schemas/hello-schema.ts',
    'src/studio/widgets/hello-widget.tsx',
    // 'src/jobs/hello.ts' // TODO: Jobs not supported in V3 SDK yet
  ],
  external: [
    '@kb-labs/plugin-manifest',
    '@kb-labs/shared-cli-ui',
    '@kb-labs/core-platform',
    'react',
    'react-dom'
  ],
  dts: true, // Temporarily disabled for V3 test
  esbuildOptions(options) {
    options.jsx = 'automatic';
    return options;
  }
});
