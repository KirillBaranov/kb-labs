#!/usr/bin/env node
// Ensures every adapter referenced by an app's kb.config.prod.json is a real
// `dependencies` entry in that app's package.json, so `pnpm deploy --prod`
// (which prunes node_modules from the static dependency graph) doesn't strip
// adapters that are only ever referenced dynamically, as strings, from config.
//
// Usage:
//   node scripts/sync-adapter-deps.mjs <app-dir> [<app-dir> ...]
//   e.g. node scripts/sync-adapter-deps.mjs services/gateway/app plugins/marketplace-registry/app

import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { execSync } from 'child_process'

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..')
const appDirs = process.argv.slice(2)

if (appDirs.length === 0) {
  console.error('Usage: node scripts/sync-adapter-deps.mjs <app-dir> [<app-dir> ...]')
  process.exit(1)
}

// ── Resolve every workspace package name once ──────────────────────────────

function loadWorkspacePackageNames() {
  const raw = execSync('pnpm list -r --depth -1 --json', { cwd: ROOT, maxBuffer: 1024 * 1024 * 32 })
  const packages = JSON.parse(raw.toString())
  return new Set(packages.map((pkg) => pkg.name))
}

// "@kb-labs/adapters-openai/embeddings" -> "@kb-labs/adapters-openai"
// "left-pad/foo"                        -> "left-pad"
function basePackageName(spec) {
  const parts = spec.split('/')
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

function collectAdapterSpecs(configPath) {
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const adapters = config?.platform?.adapters ?? {}
  return Object.entries(adapters).map(([slot, spec]) => ({ slot, spec, pkg: basePackageName(spec) }))
}

function syncApp(appDir, workspacePackages) {
  const configPath = join(ROOT, appDir, '.kb', 'kb.config.prod.json')
  const packageJsonPath = join(ROOT, appDir, 'package.json')

  const specs = collectAdapterSpecs(configPath)
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  packageJson.dependencies ??= {}

  const missing = []
  const unresolved = []
  for (const { slot, spec, pkg } of specs) {
    if (!workspacePackages.has(pkg)) {
      unresolved.push({ slot, spec, pkg })
      continue
    }
    if (!(pkg in packageJson.dependencies)) missing.push(pkg)
  }

  if (unresolved.length > 0) {
    const details = unresolved
      .map(({ slot, spec, pkg }) => `  - ${slot}: "${spec}" (resolved package "${pkg}" does not exist in the workspace)`)
      .join('\n')
    console.error(`sync-adapter-deps: ${appDir} references adapters that don't exist:\n${details}`)
    process.exit(1)
  }

  if (missing.length === 0) {
    console.log(`sync-adapter-deps: ${appDir} — all ${specs.length} config adapters already declared`)
    return
  }

  for (const pkg of missing) packageJson.dependencies[pkg] = 'workspace:*'
  packageJson.dependencies = Object.fromEntries(
    Object.entries(packageJson.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  )
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n')
  console.log(`sync-adapter-deps: ${appDir} — added ${missing.length} missing adapter dep(s): ${missing.join(', ')}`)
}

const workspacePackages = loadWorkspacePackageNames()
for (const appDir of appDirs) syncApp(appDir, workspacePackages)
