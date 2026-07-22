import { defineConfig } from 'tsup'
import { readTsupExternalSync } from './external-sync.mjs'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Derive tsup entry points from package.json.
 * Reads two sources of published dist artifacts:
 *   1. `exports` — public module surface ("./dist/foo.js" → "src/foo.ts")
 *   2. `kb.manifest` — plugin/adapter manifest loaded at runtime by the
 *      kb-labs platform; it's referenced as a dist path but not exported,
 *      so it would otherwise be silently omitted from the build.
 * Falls back to ['src/index.ts'] if nothing resolves.
 */
function resolveEntryFromExports() {
  try {
    const pkgPath = join(process.cwd(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const srcFiles = new Set()

    const distPaths = []
    for (const condition of Object.values(pkg.exports ?? {})) {
      const importPath = typeof condition === 'string' ? condition
        : (condition.import ?? condition.default ?? null)
      if (importPath && typeof importPath === 'string') distPaths.push(importPath)
    }
    if (typeof pkg.kb?.manifest === 'string') distPaths.push(pkg.kb.manifest)

    for (const p of distPaths) {
      const base = p.replace(/^\.\/dist\//, '').replace(/\.js$/, '')
      const candidates = [`src/${base}.ts`, `${base}.ts`]
      for (const c of candidates) {
        if (existsSync(join(process.cwd(), c))) { srcFiles.add(c); break }
      }
    }

    return srcFiles.size > 0 ? Array.from(srcFiles) : ['src/index.ts']
  } catch {
    return ['src/index.ts']
  }
}

/**
 * Resolve the built manifest JS path from `pkg.kb.manifest`.
 * e.g. pkg.kb.manifest = "./dist/manifest.js" → "<cwd>/dist/manifest.js"
 */
function resolveManifestDistPath() {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
    if (typeof pkg.kb?.manifest === 'string') {
      return join(process.cwd(), pkg.kb.manifest.replace(/^\.\//, ''))
    }
  } catch { /* nothing to emit */ }
  return null
}

/**
 * Fast path: read the compiled dist/manifest.js as TEXT and evaluate just the
 * `manifest` object literal via Function().
 *
 * Why not dynamic `import()` here?
 * In multi-entry tsup builds `onSuccess` fires while Node's module cache may
 * still hold a stale (empty) version of dist/manifest.js from an earlier
 * watch-mode iteration, or the file descriptors may not be fully flushed.
 * Using `import()` with a cache-bust URL is unreliable in those cases —
 * it returned an empty module in CI, producing a 0-byte manifest.json that
 * kb-create rejected with "unexpected end of JSON input".
 *
 * This only works when `manifest = {...}` is a self-contained literal with no
 * references to other module-scope variables. Service manifests tend to be
 * written that way. Plugin manifests generally are NOT — they build
 * `permissions` via `combinePermissions().build()` as a prior statement and
 * reference the result by identifier inside the `manifest` literal, which
 * this isolated eval can't resolve. For those, see `emitManifestJsonViaSubprocess`.
 */
function emitManifestJsonFast(distPath) {
  const js = readFileSync(distPath, 'utf8')
  // tsup ESM output pattern (from inspecting actual built files):
  //   var manifest = { schema: "kb.service/1", id: "...", ... };
  //   var manifest_default = manifest;
  //   export { manifest_default as default, manifest };
  // Capture everything between `var manifest =` and the next `var manifest_default`.
  const match = js.match(/var\s+manifest\s*=\s*(\{[\s\S]*?\n\});\s*\nvar\s+manifest_default/)
  if (!match) return null
  // eslint-disable-next-line no-new-func
  const obj = new Function(`"use strict"; return (${match[1]})`)()
  if (!obj || typeof obj !== 'object') return null
  return obj
}

/**
 * Fallback path: spawn a fresh `node` process to `import()` the compiled
 * module and dump the resolved default export as JSON on stdout.
 *
 * Running in a separate process (rather than `import()` in-process) sidesteps
 * the same-process module-cache staleness problem the fast path avoids by
 * using text parsing — this process only ever imports the file once, fresh
 * off disk. This is the same technique `internal/scan/scanner.js` in
 * kb-create already uses at install time; here it runs once at build time
 * instead. For plugin manifests (which build `permissions` via
 * `combinePermissions().build()` as a separate statement, not an inline
 * literal) this is the path that actually resolves the real object — the
 * fast text-eval path can't see that prior statement's result. In practice
 * this fallback fires for nearly every plugin manifest, not rarely.
 */
async function emitManifestJsonViaSubprocess(distPath) {
  const url = new URL(`file://${distPath}`).href
  const script = `import(${JSON.stringify(url)}).then(m => process.stdout.write(JSON.stringify(m.default ?? m.manifest)))`
  const { stdout } = await execFileAsync(process.execPath, ['-e', script], {
    cwd: process.cwd(),
    timeout: 30_000,
  })
  const obj = JSON.parse(stdout)
  if (!obj || typeof obj !== 'object') return null
  return obj
}

/**
 * tsup `onSuccess`: emit dist/manifest.json from the compiled manifest
 * module, for both service (`kb.service/*`) and plugin (`kb.plugin/*`)
 * schemas, so kb-create (a Go binary) can read install-relevant fields
 * without executing JS.
 */
async function emitManifestJson() {
  const distPath = resolveManifestDistPath()
  if (!distPath || !existsSync(distPath)) return
  let obj = null
  let fastPathError = null
  try {
    obj = emitManifestJsonFast(distPath)
  } catch (err) {
    fastPathError = err
  }
  if (!obj || typeof obj.schema !== 'string' || !/^kb\.(service|plugin)\//.test(obj.schema)) {
    try {
      obj = await emitManifestJsonViaSubprocess(distPath)
    } catch (err) {
      console.warn(`[kb-devkit] failed to emit manifest JSON for ${distPath}:`, fastPathError ?? err)
      return
    }
  }
  if (!obj || typeof obj.schema !== 'string' || !/^kb\.(service|plugin)\//.test(obj.schema)) {
    console.warn(`[kb-devkit] manifest at ${distPath} has no recognizable kb.service/kb.plugin schema — skipping JSON emission`)
    return
  }
  try {
    const jsonPath = distPath.replace(/\.js$/, '.json')
    writeFileSync(jsonPath, JSON.stringify(obj, null, 2) + '\n')
  } catch (err) {
    console.warn(`[kb-devkit] failed to write manifest JSON for ${distPath}:`, err)
  }
}

function resolveExternalDependencies() {
  try {
    const pkgPath = join(process.cwd(), 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    const deps = Object.keys(pkg.dependencies ?? {})
    const peerDeps = Object.keys(pkg.peerDependencies ?? {})
    return Array.from(new Set([...deps, ...peerDeps]))
  } catch {
    return []
  }
}

function getExternal() {
  // Try to use generated tsup.external.json if available
  // This file should be generated by kb-devkit-tsup-external and contains:
  // - All @kb-labs/* workspace packages (found via pnpm-workspace.yaml)
  // - All dependencies and peerDependencies from package.json
  try {
    const generated = readTsupExternalSync()
    if (generated.length > 0) {
      return generated
    }
  } catch {
    // If reading fails, fallback to package.json
  }
  // Fallback to reading package.json directly
  return resolveExternalDependencies()
}

// Pre-compute external list and entry once at module load time
const externalList = getExternal()
const entryFromExports = resolveEntryFromExports()

export default defineConfig({
  entry: entryFromExports,
  format: ['esm'],
  target: 'es2022',
  sourcemap: true,
  clean: true,
  dts: true,
  treeshake: true,
  minify: false,
  outDir: 'dist',
  splitting: false,
  skipNodeModulesBundle: true,
  shims: false,
  // Emit dist/manifest.json from the built manifest module so Go installers
  // (kb-create) can read service/plugin install metadata without executing
  // JS. No-op for packages without a manifest.
  onSuccess: emitManifestJson,
  ignoreWatch: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.git/**',
  ],
  // Mark all node_modules packages as external (including transitive deps)
  // Use noExternal: [] to prevent bundling any node_modules packages
  // This is more reliable than regex for ensuring transitive deps stay external
  noExternal: [],
  external: [
    /^[^./]|^\.[^./]|^\.\.[^/]/, // All node_modules packages (not relative paths)
    // All workspace packages from tsup.external.json (generated by kb-devkit-tsup-external)
    // This includes all @kb-labs/* packages found in pnpm-workspace.yaml
    // plus dependencies/peerDependencies from package.json
    ...externalList, // Explicitly listed packages (workspace + local deps)
    // Force all @kb-labs packages to be external
    // This catches packages linked via "link:" protocol that might not be in the workspace scan
    /^@kb-labs\//,
  ],
})
