/**
 * KB Labs Package Scanner
 *
 * Scans node_modules for KB Labs entities (plugins, adapters, services).
 * Each package declares its manifest via the "kb.manifest" field in package.json.
 * The manifest is a compiled JS module (dist/manifest.js) that exports a manifest object.
 *
 * Usage: node scanner.js <platformDir>
 * Output: JSON to stdout
 *
 * Embedded into kb-create Go binary via //go:embed.
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const platformDir = process.argv[2];
if (!platformDir) {
  process.stderr.write('Usage: node scanner.js <platformDir>\n');
  process.exit(1);
}

const nodeModules = path.join(platformDir, 'node_modules');

/** Recursively find all package.json files in node_modules (scoped + unscoped). */
function findPackages(dir) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const full = path.join(dir, entry);
      if (entry.startsWith('@')) {
        // Scoped: @scope/pkg
        try {
          for (const sub of fs.readdirSync(full)) {
            const pkgJson = path.join(full, sub, 'package.json');
            if (fs.existsSync(pkgJson)) results.push(pkgJson);
          }
        } catch {}
      } else {
        const pkgJson = path.join(full, 'package.json');
        if (fs.existsSync(pkgJson)) results.push(pkgJson);
      }
    }
  } catch {}
  return results;
}

/** Get the manifest path from package.json "kb" or "kbLabs" field. */
function getManifestPath(pkg) {
  // kb.manifest or kbLabs.manifest
  const kb = pkg.kb || pkg.kbLabs || pkg['kb-labs'];
  if (kb && kb.manifest) return kb.manifest;
  return null;
}

/** Detect entity schema from manifest object. */
function detectSchema(manifest) {
  if (manifest.schema === 'kb.plugin/3') return 'plugin';
  if (manifest.schema === 'kb.service/1') return 'service';
  if (manifest.manifestVersion && manifest.implements) return 'adapter';
  // Fallback: check for plugin-like fields
  if (manifest.cli || manifest.rest || manifest.workflows) return 'plugin';
  return 'unknown';
}

/** Extract entity kinds from a plugin manifest (same logic as extractEntityKinds). */
function extractProvides(manifest) {
  const kinds = ['plugin'];
  if (manifest.cli?.commands?.length) kinds.push('cli-command');
  if (manifest.rest?.routes?.length) kinds.push('rest-route');
  if (manifest.ws?.channels?.length) kinds.push('ws-channel');
  if (manifest.workflows?.handlers?.length) kinds.push('workflow');
  if (manifest.webhooks?.handlers?.length) kinds.push('webhook');
  if (manifest.jobs?.handlers?.length) kinds.push('job');
  if (manifest.cron?.schedules?.length) kinds.push('cron');
  if (manifest.studio?.pages?.length) kinds.push('studio-widget');
  if (manifest.studio?.menus?.length) kinds.push('studio-menu');
  return kinds;
}

async function main() {
  const packageFiles = findPackages(nodeModules);
  const result = { plugins: [], adapters: [], services: [], errors: [] };

  for (const pkgJsonPath of packageFiles) {
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    } catch { continue; }

    const manifestRel = getManifestPath(pkg);
    if (!manifestRel) continue;

    const pkgRoot = path.dirname(pkgJsonPath);
    const manifestAbs = path.resolve(pkgRoot, manifestRel);

    if (!fs.existsSync(manifestAbs)) {
      result.errors.push({ package: pkg.name, error: `manifest not found: ${manifestRel}` });
      continue;
    }

    let manifest;
    try {
      const mod = await import(pathToFileURL(manifestAbs).href);
      manifest = mod.manifest || mod.default;
      if (!manifest) {
        result.errors.push({ package: pkg.name, error: 'no manifest or default export' });
        continue;
      }
    } catch (err) {
      result.errors.push({ package: pkg.name, error: `import failed: ${err.message}` });
      continue;
    }

    const schema = detectSchema(manifest);
    const relPath = './' + path.relative(platformDir, pkgRoot);

    if (schema === 'plugin') {
      result.plugins.push({
        id: manifest.id || pkg.name,
        name: manifest.display?.name || manifest.id || pkg.name,
        version: manifest.version || pkg.version,
        description: manifest.display?.description || pkg.description || '',
        resolvedPath: relPath,
        primaryKind: 'plugin',
        provides: extractProvides(manifest),
      });
    } else if (schema === 'adapter') {
      result.adapters.push({
        id: manifest.id || pkg.name,
        name: manifest.name || pkg.name,
        version: manifest.version || pkg.version,
        description: manifest.description || pkg.description || '',
        resolvedPath: relPath,
        implements: manifest.implements,
        type: manifest.type || 'core',
      });
    } else if (schema === 'service') {
      result.services.push({
        id: manifest.id,
        name: manifest.name || pkg.name,
        version: manifest.version || pkg.version,
        description: manifest.description || pkg.description || '',
        resolvedPath: relPath,
        runtime: manifest.runtime,
        dependsOn: manifest.dependsOn || [],
      });
    }
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch(err => {
  process.stderr.write(`scanner error: ${err.message}\n`);
  process.exit(1);
});
