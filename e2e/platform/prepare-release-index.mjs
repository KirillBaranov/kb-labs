#!/usr/bin/env node

// Build the E2E platform's V2 release index from the exact tarballs that are
// copied into the image. The registry manifest remains the E2E composition
// source, while the sealed index is the only input consumed by kb-create.

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const required = name => {
  const result = value(name);
  if (!result) throw new Error(`${name} is required`);
  return result;
};

const packagesDir = resolve(required('--packages-dir'));
const registryManifest = JSON.parse(readFileSync(resolve(required('--registry-manifest')), 'utf8'));
const output = resolve(required('--output'));
const sealer = resolve(required('--sealer'));
const stage = resolve('/tmp/kb-e2e-release-stage');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

const wanted = [
  ...(registryManifest.core ?? []).map(item => item.name),
  ...(registryManifest.services ?? []).map(item => item.pkg),
  ...(registryManifest.plugins ?? []).map(item => item.pkg),
  ...(registryManifest.adapters ?? []).map(item => item.name),
].filter(Boolean);
const wantedSet = new Set(wanted);
const packages = new Map();

for (const filename of readdirSync(packagesDir).filter(name => name.endsWith('.tgz'))) {
  const tarball = join(packagesDir, filename);
  const packageJSON = JSON.parse(execFileSync('tar', ['-xOzf', tarball, 'package/package.json'], { encoding: 'utf8' }));
  if (wantedSet.has(packageJSON.name)) {
    packages.set(packageJSON.name, { name: packageJSON.name, version: packageJSON.version, tarball: filename, sha256: sha256(tarball) });
  }
}

for (const name of wanted) {
  if (!packages.has(name)) throw new Error(`registry manifest package is not packed: ${name}`);
}

writeFileSync(join(stage, 'manifest.json'), `${JSON.stringify([...packages.values()], null, 2)}\n`);
const binaryManifest = join(stage, 'binary-manifest.json');
writeFileSync(binaryManifest, '{"binaries":[]}\n');

const adapterConfig = JSON.stringify({
  documentDatabase: '@kb-labs/adapters-sqlite',
  kvStore: '@kb-labs/adapters-sqlite/kv',
  serviceTransport: '@kb-labs/adapters-service-transport-http',
});
const adapterOptions = JSON.stringify({
  serviceTransport: {
    services: Object.fromEntries((registryManifest.services ?? [])
      .filter(({ id, port }) => id && port)
      .map(({ id, port }) => [id, { url: `http://127.0.0.1:${port}` }])),
  },
});
const platformMembers = (registryManifest.core ?? [])
  .map(item => item.name)
  .filter(name => name && name !== '@kb-labs/core-runtime' && name !== '@kb-labs/sdk')
  .join(',');
const result = spawnSync(process.execPath, [
  '/src/kb-create/scripts/prepare-release-index.mjs',
  '--flow', 'platform',
  '--channel', 'stable',
  '--artifacts-dir', stage,
  '--binary-manifest', binaryManifest,
  '--platform-requires', 'serviceTransport',
  '--platform-adapter-config', adapterConfig,
  '--platform-adapter-options', adapterOptions,
  '--platform-member-packages', platformMembers,
  '--registry', 'http://verdaccio:4873',
  '--output', output,
  '--sealer-bin', sealer,
], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
