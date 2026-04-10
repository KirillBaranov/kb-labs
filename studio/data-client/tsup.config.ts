import { defineConfig } from 'tsup';
import reactLibPreset from '@kb-labs/devkit/tsup/react-lib';

export default defineConfig({
  ...reactLibPreset,
  tsconfig: "tsconfig.build.json", // Use build-specific tsconfig without paths
});


