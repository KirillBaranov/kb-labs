import { defineConfig } from 'tsup';
import reactLibPreset from '@kb-labs/devkit/tsup/react-lib.js';

export default defineConfig({
  ...reactLibPreset,
  tsconfig: "tsconfig.build.json",
});
