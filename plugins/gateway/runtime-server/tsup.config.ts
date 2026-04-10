import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

const isDockerBuild = process.env.DOCKER_BUILD === '1';

export default defineConfig({
  ...nodePreset,
  dts: true,
  tsconfig: 'tsconfig.build.json',
  entry: ['src/index.ts', 'src/cli.ts'],
  // When building for Docker: bundle all deps into a single CJS file
  // CJS avoids ESM/CJS interop issues (ws, other native modules use require())
  ...(isDockerBuild && {
    format: ['cjs'],
    noExternal: [/.*/],
    external: [/^node:/],
  }),
});
