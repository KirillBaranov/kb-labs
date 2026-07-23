import { defineConfig } from 'tsup'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import nodePreset from '@kb-labs/devkit/tsup/node'

const execFileAsync = promisify(execFile)

export default defineConfig({
  ...nodePreset,
  tsconfig: "tsconfig.build.json",
  entry: {
    index: 'src/index.ts',
    'sandbox/index': 'src/sandbox/index.ts',
    'sandbox/bootstrap': 'src/sandbox/bootstrap.ts',
  },
  // Override external to bundle plugin-contracts-v3 into bootstrap
  // Bootstrap needs to be standalone when forked as subprocess (no access to node_modules)
  external: [
    // Bundle @kb-labs/plugin-contracts and @kb-labs/shared-cli-ui (remove from external list)
    // Keep only Node.js built-ins external
    /^node:/,
    // Keep 'fs' external for sync fallback support
    'fs',
  ],
  noExternal: [
    '@kb-labs/plugin-contracts', // Explicitly bundle this
    '@kb-labs/shared-cli-ui', // Explicitly bundle this (needed for bootstrap)
  ],
  // Chain the preset's own onSuccess (manifest.json emission — a no-op here,
  // this package has no kb.plugin/kb.service manifest) with
  // scripts/emit-adapter-roles.mjs. This MUST run as part of tsup's build
  // hook, not only as a `&&`-chained step in package.json's "build" script:
  // kb-devkit run build (the build path CI and CLAUDE.md's "Building"
  // section mandate — never plain `pnpm -r`/`pnpm run build`) invokes tsup
  // directly per package, not the full npm script chain, so a postbuild
  // step wired only via package.json silently never ran there. Spawned as
  // its own fresh `node` process for the same reason emit-adapter-roles.mjs
  // already documented: no module-cache staleness to worry about.
  onSuccess: async () => {
    await nodePreset.onSuccess?.()
    await execFileAsync(process.execPath, ['scripts/emit-adapter-roles.mjs'])
  },
})
