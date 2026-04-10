import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
  dts: true,
  external: [
    ...(nodePreset.external || []),
    '@kb-labs/sdk', // All platform access goes through SDK only
  ],
});
