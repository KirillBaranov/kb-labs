#!/usr/bin/env node

// Publish-time preparation for the V2 release contract. This script owns the
// adapter from staged package manifests to the V2 index; the launcher only
// consumes the sealed result. It deliberately reads the exact tarballs from
// release stage instead of rebuilding or resolving npm tags.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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

const artifactsDir = resolve(required('--artifacts-dir'));
const sdkArtifactsDir = value('--sdk-artifacts-dir') ? resolve(value('--sdk-artifacts-dir')) : undefined;
const output = resolve(required('--output'));
const flow = required('--flow');
const channel = value('--channel') ?? 'stable';
const registry = value('--registry') ?? 'https://registry.npmjs.org';
const platformPackage = value('--platform-package') ?? '@kb-labs/core-runtime';
const sdkPackage = value('--sdk-package') ?? '@kb-labs/sdk';
const platformVersion = value('--platform-version');
const sdkVersion = value('--sdk-version');
const binaryManifestPath = value('--binary-manifest') ? resolve(value('--binary-manifest')) : undefined;
if (flow === 'platform' && !binaryManifestPath) throw new Error('--binary-manifest is required for the unified platform release-index');
const sealerBin = value('--sealer-bin') ? resolve(value('--sealer-bin')) : undefined;
const platformRequires = (value('--platform-requires') ?? '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean)
  .map(capability => ({ capability, requiredBy: 'platform' }));
const platformAdapterConfig = value('--platform-adapter-config')
  ? JSON.parse(value('--platform-adapter-config'))
  : undefined;
const platformAdapterOptions = value('--platform-adapter-options')
  ? JSON.parse(value('--platform-adapter-options'))
  : undefined;
const platformMemberPackages = (value('--platform-member-packages') ?? '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

const readStage = directory => {
  const entries = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  if (!Array.isArray(entries) || entries.length === 0) throw new Error(`stage manifest contains no artifacts: ${directory}`);
  return entries.map(item => ({ item, directory }));
};
const stagedEntries = [...readStage(artifactsDir), ...(sdkArtifactsDir ? readStage(sdkArtifactsDir) : [])];
const stage = stagedEntries.map(({ item }) => item);
if (new Set(stage.map(item => item.name)).size !== stage.length) throw new Error('stage manifests contain duplicate package names');

const byName = new Map(stage.map(item => [item.name, item]));
const sourceDirByName = new Map(stagedEntries.map(({ item, directory }) => [item.name, directory]));
const platform = byName.get(platformPackage);
if (!platform) throw new Error(`platform package ${platformPackage} is absent from stage manifest`);
const resolvedPlatformVersion = platformVersion ?? platform.version;
if (platform.version !== resolvedPlatformVersion) throw new Error(`platform version mismatch: stage=${platform.version}, expected=${resolvedPlatformVersion}`);

const sdk = byName.get(sdkPackage);
if (sdkVersion && (!sdk || sdk.version !== sdkVersion)) throw new Error(`SDK version mismatch for ${sdkPackage}`);
if (!sdk) throw new Error(`SDK package ${sdkPackage} is absent from stage manifest; compatibility cannot be validated without an exact SDK artifact`);
const binaries = binaryManifestPath ? JSON.parse(readFileSync(binaryManifestPath, 'utf8')).binaries : [];
if (!Array.isArray(binaries)) throw new Error('binary manifest must contain a binaries array');
for (const binary of binaries) {
  for (const field of ['id', 'os', 'arch', 'url', 'filename', 'sha256']) if (!binary[field]) throw new Error(`binary manifest entry is missing ${field}`);
  if (binary.version && binary.version !== resolvedPlatformVersion) throw new Error(`binary ${binary.id} version ${binary.version} does not match platform ${resolvedPlatformVersion}`);
}

const staging = resolve(`${artifactsDir}/v2-manifest-root`);
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

const manifestFor = item => {
  const packageDir = join(staging, 'node_modules', item.name);
  mkdirSync(packageDir, { recursive: true });
  const tarball = resolve(sourceDirByName.get(item.name) ?? artifactsDir, item.tarball);
  if (!existsSync(tarball)) throw new Error(`staged tarball is missing: ${tarball}`);
  const result = spawnSync('tar', ['-xzf', tarball, '-C', packageDir, '--strip-components=1'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`extract ${item.name}: ${result.stderr || result.stdout}`);
  for (const candidate of [join(packageDir, 'kb-create.manifest.json'), join(packageDir, 'dist', 'kb-create.manifest.json'), join(packageDir, 'dist', 'manifest.json')]) {
    if (existsSync(candidate)) return JSON.parse(readFileSync(candidate, 'utf8'));
  }
  const javascriptManifest = join(packageDir, 'dist', 'manifest.js');
  if (existsSync(javascriptManifest)) {
    const source = readFileSync(javascriptManifest, 'utf8');
    const id = source.match(/\bid:\s*["']([^"']+)["']/)?.[1];
    const implementsValue = source.match(/\bimplements:\s*["']([^"']+)["']/)?.[1];
    if (id && implementsValue) {
      return { schema: 'kb.adapter/1', id, implements: implementsValue };
    }
  }
  return undefined;
};

const packageJSONFor = item => {
  const path = join(staging, 'node_modules', item.name, 'package.json');
  if (!existsSync(path)) throw new Error(`${item.name} tarball has no package.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
};

const tarballURL = item => {
  const packageBase = item.name.split('/').pop();
  return `${registry.replace(/\/$/, '')}/${item.name}/-/${packageBase}-${item.version}.tgz`;
};
const component = (item, manifest, id = item.name.split('/').pop().replace(/-entry$/, '')) => ({
  id,
  version: item.version,
  package: item.name,
  tarball: tarballURL(item),
  sha256: item.sha256,
  config: manifest?.requirements ?? [],
});

const services = [];
const plugins = [];
const adapters = [];
for (const item of stage) {
  const manifest = manifestFor(item);
  const normalizedID = item.name === platformPackage
    ? 'platform'
    : item.name === sdkPackage
      ? 'sdk'
      : manifest?.schema === 'kb.service/1'
        ? manifest.id
        : manifest?.schema === 'kb.adapter/1'
          ? manifest.id
        : idFor(item.name);
  const generatedRequirements = item.name === platformPackage
    ? [
        ...(platformAdapterConfig ? [{ id: 'platform.adapters', path: '/platform/adapters', default: platformAdapterConfig }] : []),
        ...(platformAdapterOptions ? [{ id: 'platform.adapterOptions', path: '/platform/adapterOptions', default: platformAdapterOptions }] : []),
      ]
    : [];
  writeFileSync(join(staging, 'node_modules', item.name, 'kb-create.manifest.json'), `${JSON.stringify({
    schema: 'kb.create.artifact-manifest/v2',
    id: normalizedID,
    package: item.name,
    version: item.version,
    requirements: [
      ...(manifest?.schema === 'kb.create.artifact-manifest/v2' ? manifest.requirements ?? [] : []),
      ...generatedRequirements,
    ],
  })}\n`);
  if (!manifest) continue;
  if (manifest.schema === 'kb.service/1') {
    services.push({
      id: manifest.id,
      packageName: item.name,
      command: manifest.bin ? Object.keys(manifest.bin)[0] : item.name.split('/').pop(),
      port: manifest.runtime?.port ?? 0,
      dependsOn: manifest.dependsOn ?? [],
      required: true,
    });
  } else if (manifest.schema === 'kb.plugin/3') {
    const requires = (manifest.platform?.requires ?? []).map(capability => ({ capability, requiredBy: idFor(item.name) }));
    plugins.push({ ...component(item, manifest, idFor(item.name)), requires });
  } else if (manifest.schema === 'kb.adapter/1') {
    const capability = manifest.implements?.replace(/^I/, '').replace(/[A-Z]/g, letter => letter.toLowerCase());
    adapters.push({ ...component(item, manifest, manifest.id ?? idFor(item.name)), provides: capability ? [capability] : [] });
  }
}

const sdkPackageJSON = packageJSONFor(sdk);
const sdkPlatformRange = sdkPackageJSON.peerDependencies?.[platformPackage];
if (!sdkPlatformRange) throw new Error(`${sdkPackage} does not declare a peer dependency on ${platformPackage}`);
if (!satisfies(resolvedPlatformVersion, sdkPlatformRange)) {
  throw new Error(`${sdkPackage}@${sdk.version} rejects ${platformPackage}@${resolvedPlatformVersion}: ${sdkPlatformRange}`);
}

const exportValue = {
  channels: { [channel]: resolvedPlatformVersion },
  compatibility: {
    schema: 'kb.release-compatibility/2',
    labels: [
      { id: `platform@${resolvedPlatformVersion}`, kind: 'platform', artifactId: 'platform', version: resolvedPlatformVersion, requires: [{ label: `sdk@${sdk.version}`, constraint: sdkPlatformRange }], status: 'prepared', validatedBy: ['stage', 'package-manifest', 'artifact-hash', 'sdk-peer-dependency'] },
      { id: `sdk@${sdk.version}`, kind: 'sdk', artifactId: 'sdk', version: sdk.version, status: 'prepared', validatedBy: ['stage', 'package-manifest', 'artifact-hash', 'sdk-peer-dependency'] },
      ...binaries.map(binary => ({ id: `binary:${binary.id}@${resolvedPlatformVersion}:${binary.os}/${binary.arch}`, kind: 'binary', artifactId: binary.id, version: resolvedPlatformVersion, requires: [{ label: `platform@${resolvedPlatformVersion}` }, { label: `sdk@${sdk.version}` }], status: 'prepared', validatedBy: ['release-asset', 'artifact-hash', 'post-publish-smoke'] })),
    ],
  },
  platforms: [{
    id: 'platform',
    version: resolvedPlatformVersion,
    package: platform.name,
    tarball: tarballURL(platform),
    sha256: platform.sha256,
    requires: platformRequires,
    config: [
      ...(platformAdapterConfig ? [{
        id: 'platform.adapters',
        path: '/platform/adapters',
        default: JSON.stringify(platformAdapterConfig),
      }] : []),
      ...(platformAdapterOptions ? [{
        id: 'platform.adapterOptions',
        path: '/platform/adapterOptions',
        default: JSON.stringify(platformAdapterOptions),
      }] : []),
    ],
    profiles: { default: { platformVersion: resolvedPlatformVersion, services: services.map(({ packageName, ...service }) => service) } },
    binaries,
    members: [...new Set([
      ...services.map(service => service.packageName),
      ...platformMemberPackages,
    ])].map(packageName => {
      const item = byName.get(packageName);
      return item ? component(item, undefined, services.find(service => service.packageName === packageName)?.id ?? idFor(packageName)) : undefined;
    }).filter(Boolean),
  }],
  sdks: sdk ? [component(sdk, undefined, 'sdk')] : [],
  plugins,
  adapters,
};

const exportPath = join(artifactsDir, 'manifest-export.json');
writeFileSync(exportPath, `${JSON.stringify(exportValue, null, 2)}\n`);

const sealer = sealerBin
  ? spawnSync(sealerBin, ['--input', exportPath, '--manifest-root', staging, '--output', output], { stdio: 'inherit' })
  : spawnSync('go', ['run', './v2/cmd/kb-create-release-index', '--input', exportPath, '--manifest-root', staging, '--output', output], {
      cwd: resolve(new URL('../', import.meta.url).pathname),
      stdio: 'inherit',
    });
if (sealer.status !== 0) process.exit(sealer.status ?? 1);

function idFor(packageName) {
  return packageName.split('/').pop().replace(/-entry$/, '');
}

const digest = createHash('sha256').update(readFileSync(output)).digest('hex');
console.log(`Release index prepared: ${output}`);
console.log(`Release index bytes: ${digest}`);

function satisfies(version, range) {
  const candidate = parseVersion(version);
  return range.split('||').some(alternative => alternative.trim().split(/\s+/).filter(Boolean).every(token => compareToken(candidate, token)));
}

function compareToken(candidate, token) {
  if (token === '*' || token.toLowerCase() === 'latest') return true;
  const operator = token.match(/^(\^|~|>=|<=|>|<|=)?(.*)$/)?.[1] ?? '=';
  const raw = token.slice(operator === '=' ? 0 : operator.length);
  const target = parseVersion(raw);
  const comparison = compareVersion(candidate, target);
  if (operator === '^') return comparison >= 0 && candidate[0] === target[0];
  if (operator === '~') return comparison >= 0 && candidate[0] === target[0] && candidate[1] === target[1];
  if (operator === '>=') return comparison >= 0;
  if (operator === '<=') return comparison <= 0;
  if (operator === '>') return comparison > 0;
  if (operator === '<') return comparison < 0;
  return comparison === 0;
}

function parseVersion(value) {
  const match = String(value).trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) throw new Error(`invalid semver in compatibility declaration: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersion(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}
