import { defineConfig } from 'tsup';
import nodePreset from '@kb-labs/devkit/tsup/node';

// Studio is an rspack-built SPA; tsup only compiles the service manifest.
// We reuse the devkit node preset SOLELY for its `onSuccess` hook, which emits
// dist/manifest.json from the compiled manifest module so kb-create can register
// Studio as a service (without it, install-service swaps the release but never
// adds Studio to devservices.yaml — the deploy then fails to start it).
//
// Overrides matter: the SPA bundle is written to dist/ by `rspack build` BEFORE
// this runs, so `clean` MUST stay false (the preset sets it true, which would
// wipe the SPA). entry is the manifest only; dts/sourcemap off for a tiny build.
export default defineConfig({
  ...nodePreset,
  entry: ['src/manifest.ts'],
  clean: false,
  dts: false,
  sourcemap: false,
});
