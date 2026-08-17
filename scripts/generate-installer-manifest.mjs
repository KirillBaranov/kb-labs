#!/usr/bin/env node
/**
 * Creates the immutable kb-create manifest attached to a platform release.
 * Package versions are read from the exact tagged checkout, so installers
 * never resolve `latest` at runtime.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const releaseTag = value('--release-tag');
const binariesTag = value('--binaries-tag');
const output = value('--output');
if (!releaseTag || !binariesTag || !output) {
  throw new Error('Usage: generate-installer-manifest.mjs --release-tag <platform-vX> --binaries-tag <vX-binaries> --output <path>');
}

async function packageVersions(dir, versions = new Map()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.kb') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await packageVersions(path, versions);
    if (entry.isFile() && entry.name === 'package.json') {
      const pkg = JSON.parse(await readFile(path, 'utf8'));
      if (typeof pkg.name === 'string' && typeof pkg.version === 'string') versions.set(pkg.name, pkg.version);
    }
  }
  return versions;
}

const versions = await packageVersions(root);
const source = join(root, 'tools/kb-create/internal/manifest/manifest.json');
const manifest = JSON.parse(await readFile(source, 'utf8'));
const pin = item => {
  const name = item.name ?? item.pkg;
  if (!name || item.localPath) return;
  const version = versions.get(name);
  if (!version) throw new Error(`No workspace package version found for ${name}`);
  item.version = version;
};

for (const item of manifest.core ?? []) pin(item);
for (const item of manifest.adapters ?? []) pin(item);
for (const item of manifest.services ?? []) pin(item);
for (const item of manifest.plugins ?? []) pin(item);
for (const item of manifest.services ?? []) {
  if (!item.plugin) continue;
  const version = versions.get(item.plugin);
  if (!version) throw new Error(`No workspace package version found for ${item.plugin}`);
  item.pluginVersion = version;
}
for (const item of manifest.binaries ?? []) {
  if (!item.localPath) item.version = binariesTag;
}
manifest.release = { tag: releaseTag, channel: 'stable', createdAt: new Date().toISOString() };

await mkdir(dirname(output), { recursive: true });
const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
await writeFile(output, encoded);
process.stdout.write(`${createHash('sha256').update(encoded).digest('hex')}  ${relative(root, output)}\n`);
