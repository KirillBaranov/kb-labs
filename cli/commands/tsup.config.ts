import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

export default defineConfig({
  ...nodePreset,
  entry: {
    index: "src/index.ts",
    // package.json exports `./registry` — emit matching dist/registry/index.{js,d.ts}
    "registry/index": "src/registry/index.ts",
  },
  dts: true,
});
