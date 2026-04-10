import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: [...(nodePreset.entry as string[]), 'src/manifest.ts'],
  tsconfig: 'tsconfig.build.json',
  dts: true,
});
