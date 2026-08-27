import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('./prepare-release-index.mjs', import.meta.url);

test('prepares a sealed index from staged plugin, service and adapter manifests', () => {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-index-'));
  const stage = join(root, 'stage');
  const packageRoot = join(root, 'packages');
  mkdirSync(stage, { recursive: true });
  const artifacts = [
    packageArtifact(root, packageRoot, stage, '@kb-labs/core-runtime', '2.0.0', ''),
    packageArtifact(root, packageRoot, stage, '@kb-labs/core-contracts', '2.0.0', ''),
    packageArtifact(root, packageRoot, stage, '@kb-labs/sdk', '2.0.0', '', { peerDependencies: { '@kb-labs/core-runtime': '>=2.0.0 <3.0.0' } }),
    packageArtifact(root, packageRoot, stage, '@kb-labs/commit-entry', '2.0.0', JSON.stringify({ schema: 'kb.plugin/3', id: '@kb-labs/commit', version: '2.0.0', platform: { requires: ['cache'] } })),
    packageArtifact(root, packageRoot, stage, '@kb-labs/workflow-daemon', '2.0.0', 'var manifest = { schema: "kb.service/1", id: "workflow", runtime: { port: 7778 } }; export { manifest };', { bin: { 'kb-workflow': './dist/index.js' } }),
    packageArtifact(root, packageRoot, stage, '@kb-labs/adapters-pino', '2.0.0', 'const manifest={id:"pino-logger",implements:["ILogger"]}; export {manifest};'),
    packageArtifact(root, packageRoot, stage, '@kb-labs/adapters-service-transport-http', '2.0.0', 'const manifest={id:"service-transport-http",implements:["IServiceTransport"]}; export {manifest};'),
    packageArtifact(root, packageRoot, stage, '@kb-labs/adapters-sqlite', '2.0.0', 'const manifest={id:"sqlite",implements:["IKVStore"]}; export {manifest};'),
    packageArtifact(root, packageRoot, stage, '@kb-labs/adapters-openai', '2.0.0', 'const manifest={id:"openai",implements:["ILLM"]}; export {manifest};'),
  ];
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(artifacts));
  const binaryManifest = join(root, 'binary-manifest.json');
  writeFileSync(binaryManifest, JSON.stringify({ binaries: [{ id: 'kb-create', os: 'linux', arch: 'amd64', url: 'https://example.test/kb-create', filename: 'kb-create-linux-amd64', sha256: 'binary-sha' }] }));
  const output = join(root, 'release-index.json');
  execFileSync(process.execPath, [script.pathname, '--flow', 'platform', '--channel', 'canary', '--artifacts-dir', stage, '--binary-manifest', binaryManifest, '--platform-requires', 'serviceTransport', '--platform-adapter-config', '{"serviceTransport":"@kb-labs/adapters-service-transport-http","kvStore":"@kb-labs/adapters-sqlite/kv","llm":"@kb-labs/adapters-openai"}', '--platform-adapter-options', '{"serviceTransport":{"services":{"workflow":{"url":"http://127.0.0.1:7778"}}},"llm":{"apiKey":"${OPENAI_API_KEY}"}}', '--platform-member-packages', '@kb-labs/core-contracts', '--output', output], { stdio: 'pipe' });
  const index = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(index.schema, 'kb.create.release-index/v2');
  assert.equal(index.compatibility.schema, 'kb.release-compatibility/2');
  assert.deepEqual(index.compatibility.labels.map(({ id, kind, artifactId, version }) => ({ id, kind, artifactId, version })), [
    { id: 'platform@2.0.0', kind: 'platform', artifactId: 'platform', version: '2.0.0' },
    { id: 'sdk@2.0.0', kind: 'sdk', artifactId: 'sdk', version: '2.0.0' },
    { id: 'binary:kb-create@2.0.0:linux/amd64', kind: 'binary', artifactId: 'kb-create', version: '2.0.0' },
  ]);
  assert.deepEqual(index.compatibility.labels[0].requires, [{ label: 'sdk@2.0.0', constraint: '>=2.0.0 <3.0.0' }]);
  assert.equal(index.channels.canary, '2.0.0');
  assert.equal(index.plugins[0].id, 'commit');
  assert.equal(index.platforms[0].profiles.default.services[0].id, 'workflow');
  assert.equal(index.platforms[0].profiles.default.services[0].command, 'kb-workflow');
  assert.deepEqual(index.platforms[0].requires, [{ capability: 'serviceTransport', requiredBy: 'platform' }]);
  assert.deepEqual(index.platforms[0].config, [
    { id: 'platform.adapters', path: '/platform/adapters', default: '{"serviceTransport":"@kb-labs/adapters-service-transport-http"}' },
    { id: 'platform.adapterOptions', path: '/platform/adapterOptions', default: '{"serviceTransport":{"services":{"workflow":{"url":"http://127.0.0.1:7778"}}}}' },
  ]);
  assert.deepEqual(index.platforms[0].members.map(({ package: packageName }) => packageName), ['@kb-labs/workflow-daemon', '@kb-labs/core-contracts', '@kb-labs/adapters-service-transport-http', '@kb-labs/adapters-sqlite', '@kb-labs/adapters-openai']);
  assert.deepEqual(index.adapters.find(adapter => adapter.id === 'pino-logger')?.provides, ['logger']);
});

test('fails closed when a configured platform adapter is not staged', () => {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-index-adapter-'));
  const stage = join(root, 'stage');
  const packageRoot = join(root, 'packages');
  mkdirSync(stage, { recursive: true });
  const artifacts = [
    packageArtifact(root, packageRoot, stage, '@kb-labs/core-runtime', '2.0.0', ''),
    packageArtifact(root, packageRoot, stage, '@kb-labs/sdk', '2.0.0', '', { peerDependencies: { '@kb-labs/core-runtime': '^2.0.0' } }),
  ];
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(artifacts));
  const binaryManifest = join(root, 'binary-manifest.json');
  writeFileSync(binaryManifest, JSON.stringify({ binaries: [{ id: 'kb-create', os: 'linux', arch: 'amd64', url: 'https://example.test/kb-create', filename: 'kb-create-linux-amd64', sha256: 'binary-sha' }] }));
  const result = spawnSync(process.execPath, [script.pathname, '--flow', 'platform', '--artifacts-dir', stage, '--binary-manifest', binaryManifest, '--platform-adapter-config', '{"cache":"@kb-labs/adapters-redis"}', '--output', join(root, 'release-index.json')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /configured platform adapter @kb-labs\/adapters-redis is absent/);
});

test('fails closed when the SDK rejects the staged platform even in the same major', () => {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-index-incompatible-'));
  const stage = join(root, 'stage');
  const packageRoot = join(root, 'packages');
  mkdirSync(stage, { recursive: true });
  const artifacts = [
    packageArtifact(root, packageRoot, stage, '@kb-labs/core-runtime', '2.155.2', ''),
    packageArtifact(root, packageRoot, stage, '@kb-labs/sdk', '2.155.2', '', { peerDependencies: { '@kb-labs/core-runtime': '<2.150.0' } }),
  ];
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(artifacts));
  const binaryManifest = join(root, 'binary-manifest.json');
  writeFileSync(binaryManifest, JSON.stringify({ binaries: [{ id: 'kb-create', os: 'linux', arch: 'amd64', url: 'https://example.test/kb-create', filename: 'kb-create-linux-amd64', sha256: 'binary-sha' }] }));
  const output = join(root, 'release-index.json');
  const result = spawnSync(process.execPath, [script.pathname, '--flow', 'platform', '--channel', 'canary', '--artifacts-dir', stage, '--binary-manifest', binaryManifest, '--output', output], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /rejects .*core-runtime@2\.155\.2/);
});

test('fails closed when a required platform member was not staged', () => {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-index-members-'));
  const stage = join(root, 'stage');
  const packageRoot = join(root, 'packages');
  mkdirSync(stage, { recursive: true });
  const artifacts = [
    packageArtifact(root, packageRoot, stage, '@kb-labs/core-runtime', '2.0.0', ''),
    packageArtifact(root, packageRoot, stage, '@kb-labs/sdk', '2.0.0', '', { peerDependencies: { '@kb-labs/core-runtime': '^2.0.0' } }),
  ];
  writeFileSync(join(stage, 'manifest.json'), JSON.stringify(artifacts));
  const binaryManifest = join(root, 'binary-manifest.json');
  writeFileSync(binaryManifest, JSON.stringify({ binaries: [{ id: 'kb-create', os: 'linux', arch: 'amd64', url: 'https://example.test/kb-create', filename: 'kb-create-linux-amd64', sha256: 'binary-sha' }] }));
  const result = spawnSync(process.execPath, [script.pathname, '--flow', 'platform', '--artifacts-dir', stage, '--binary-manifest', binaryManifest, '--platform-member-packages', '@kb-labs/cli-bin', '--output', join(root, 'release-index.json')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /required platform member @kb-labs\/cli-bin is absent/);
});

function packageArtifact(root, packageRoot, stage, name, version, manifest, extra = {}) {
  const packageDir = join(packageRoot, 'package');
  rmSync(packageDir, { recursive: true, force: true });
  mkdirSync(join(packageDir, 'dist'), { recursive: true });
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, version, ...extra }));
  if (manifest) {
    writeFileSync(join(packageDir, /^(?:const|var) /.test(manifest) ? 'dist/manifest.js' : 'dist/manifest.json'), manifest);
  }
  const filename = `${name.split('/').pop()}-${version}.tgz`;
  const tarball = join(stage, filename);
  const result = spawnSync('tar', ['-czf', tarball, '-C', packageRoot, 'package'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const sha256 = execFileSync('shasum', ['-a', '256', tarball], { encoding: 'utf8' }).split(' ')[0];
  return { name, version, tarball: filename, sha256 };
}
