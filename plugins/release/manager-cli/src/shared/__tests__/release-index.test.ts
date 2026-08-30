/**
 * Coverage migrated from `tools/kb-create/scripts/prepare-release-index.test.mjs`,
 * which was deleted together with the script whose logic now lives in
 * `shared/bundle/release-index.ts`.
 *
 * The four original cases are all preserved: a full index from plugin, service
 * and adapter manifests, and the three fail-closed paths (unstaged configured
 * adapter, an SDK that rejects the staged platform, and a missing required
 * platform member).
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildReleaseIndex, type StagedArtifactRef } from '../bundle/release-index.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); }
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-index-'));
  roots.push(root);
  return root;
}

/** Builds a real tarball for one package, mirroring what `npm pack` produces. */
function artifact(
  root: string,
  name: string,
  version: string,
  manifest: string,
  extra: Record<string, unknown> = {},
): StagedArtifactRef {
  const stage = join(root, 'stage');
  const packageRoot = join(root, 'build', name.replace(/[^a-z0-9]+/gi, '-'));
  const packageDir = join(packageRoot, 'package');
  mkdirSync(join(packageDir, 'dist'), { recursive: true });
  mkdirSync(stage, { recursive: true });

  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name, version, ...extra }));
  if (manifest) {
    writeFileSync(
      join(packageDir, /^(?:const|var) /.test(manifest) ? 'dist/manifest.js' : 'dist/manifest.json'),
      manifest,
    );
  }

  const filename = `${name.split('/').pop()}-${version}.tgz`;
  const tarball = join(stage, filename);
  execFileSync('tar', ['-czf', tarball, '-C', packageRoot, 'package']);

  return {
    name,
    version,
    tarball,
    sha256: createHash('sha256').update(execFileSync('cat', [tarball])).digest('hex'),
  };
}

describe('buildReleaseIndex', () => {
  it('RI-01: prepares an index from staged plugin, service and adapter manifests', () => {
    const root = makeRoot();
    const staged = [
      artifact(root, '@kb-labs/core-runtime', '2.0.0', ''),
      artifact(root, '@kb-labs/core-contracts', '2.0.0', ''),
      artifact(root, '@kb-labs/sdk', '2.0.0', '', { peerDependencies: { '@kb-labs/core-runtime': '>=2.0.0 <3.0.0' } }),
      artifact(root, '@kb-labs/commit-entry', '2.0.0', JSON.stringify({
        schema: 'kb.plugin/3', id: '@kb-labs/commit', version: '2.0.0', platform: { requires: ['cache'] },
      })),
      artifact(root, '@kb-labs/workflow-daemon', '2.0.0',
        'var manifest = { schema: "kb.service/1", id: "workflow", runtime: { port: 7778 } }; export { manifest };',
        { bin: { 'kb-workflow': './dist/index.js' } }),
      artifact(root, '@kb-labs/adapters-pino', '2.0.0', 'const manifest={id:"pino-logger",implements:["ILogger"]}; export {manifest};'),
      artifact(root, '@kb-labs/adapters-service-transport-http', '2.0.0',
        'const manifest={id:"service-transport-http",implements:["IServiceTransport"]}; export {manifest};'),
      artifact(root, '@kb-labs/adapters-sqlite', '2.0.0', 'const manifest={id:"sqlite",implements:["IKVStore"]}; export {manifest};'),
      artifact(root, '@kb-labs/adapters-openai', '2.0.0', 'const manifest={id:"openai",implements:["ILLM"]}; export {manifest};'),
    ];

    const result = buildReleaseIndex(staged, {
      channel: 'canary',
      workDir: join(root, 'work'),
      binaries: [{
        id: 'kb-create', os: 'linux', arch: 'amd64',
        url: 'https://example.test/kb-create', filename: 'kb-create-linux-amd64', sha256: 'a'.repeat(64),
      }],
      platformRequires: ['serviceTransport'],
      platformAdapterConfig: {
        serviceTransport: '@kb-labs/adapters-service-transport-http',
        kvStore: '@kb-labs/adapters-sqlite/kv',
        llm: '@kb-labs/adapters-openai',
      },
      platformAdapterOptions: {
        serviceTransport: { services: { workflow: { url: 'http://127.0.0.1:7778' } } },
        llm: { apiKey: '${OPENAI_API_KEY}' },
      },
      platformMemberPackages: ['@kb-labs/core-contracts'],
    });

    const index = result.export;
    expect(index.compatibility.schema).toBe('kb.release-compatibility/2');
    expect(index.compatibility.labels.map(({ id, kind, artifactId, version }) => ({ id, kind, artifactId, version })))
      .toEqual([
        { id: 'platform@2.0.0', kind: 'platform', artifactId: 'platform', version: '2.0.0' },
        { id: 'sdk@2.0.0', kind: 'sdk', artifactId: 'sdk', version: '2.0.0' },
        { id: 'binary:kb-create@2.0.0:linux/amd64', kind: 'binary', artifactId: 'kb-create', version: '2.0.0' },
      ]);
    expect(index.compatibility.labels[0]!.requires)
      .toEqual([{ label: 'sdk@2.0.0', constraint: '>=2.0.0 <3.0.0' }]);
    expect(index.channels.canary).toBe('2.0.0');
    expect(index.plugins[0]!.id).toBe('commit');

    const platform = index.platforms[0] as Record<string, never> & {
      profiles: { default: { services: Array<{ id: string; command: string }> } };
      requires: unknown;
      config: unknown;
      members: Array<{ package: string }>;
    };
    expect(platform.profiles.default.services[0]).toMatchObject({ id: 'workflow', command: 'kb-workflow' });
    expect(platform.requires).toEqual([{ capability: 'serviceTransport', requiredBy: 'platform' }]);

    // Only the transport travels in the sealed default configuration: remote
    // providers and their credentials belong in a consumer overlay.
    expect(platform.config).toEqual([
      {
        id: 'platform.adapters',
        path: '/platform/adapters',
        default: '{"serviceTransport":"@kb-labs/adapters-service-transport-http"}',
      },
      {
        id: 'platform.adapterOptions',
        path: '/platform/adapterOptions',
        default: '{"serviceTransport":{"services":{"workflow":{"url":"http://127.0.0.1:7778"}}}}',
      },
    ]);
    expect(platform.members.map(member => member.package)).toEqual([
      '@kb-labs/workflow-daemon',
      '@kb-labs/core-contracts',
      '@kb-labs/adapters-service-transport-http',
      '@kb-labs/adapters-sqlite',
      '@kb-labs/adapters-openai',
    ]);
    expect(index.adapters.find(adapter => adapter.id === 'pino-logger')?.provides).toEqual(['logger']);

    // Rule 6: every staged package leaves with a classification.
    expect(Object.fromEntries(result.classifications.map(pkg => [pkg.name, pkg.classification])))
      .toMatchObject({
        '@kb-labs/core-runtime': 'platform',
        '@kb-labs/core-contracts': 'member',
        '@kb-labs/sdk': 'sdk',
        '@kb-labs/commit-entry': 'plugin',
        '@kb-labs/workflow-daemon': 'member',
        '@kb-labs/adapters-pino': 'adapter',
      });
  });

  it('RI-02: fails closed when a configured platform adapter is not staged', () => {
    const root = makeRoot();
    const staged = [
      artifact(root, '@kb-labs/core-runtime', '2.0.0', ''),
      artifact(root, '@kb-labs/sdk', '2.0.0', '', { peerDependencies: { '@kb-labs/core-runtime': '^2.0.0' } }),
    ];

    expect(() => buildReleaseIndex(staged, {
      channel: 'canary',
      workDir: join(root, 'work'),
      platformAdapterConfig: { cache: '@kb-labs/adapters-redis' },
    })).toThrow(/configured platform adapter @kb-labs\/adapters-redis is absent/);
  });

  it('RI-03: fails closed when the SDK rejects the staged platform even in the same major', () => {
    const root = makeRoot();
    const staged = [
      artifact(root, '@kb-labs/core-runtime', '2.155.2', ''),
      artifact(root, '@kb-labs/sdk', '2.155.2', '', { peerDependencies: { '@kb-labs/core-runtime': '<2.150.0' } }),
    ];

    expect(() => buildReleaseIndex(staged, { channel: 'canary', workDir: join(root, 'work') }))
      .toThrow(/rejects @kb-labs\/core-runtime@2\.155\.2/);
  });

  it('RI-04: fails closed when a required platform member was not staged', () => {
    const root = makeRoot();
    const staged = [
      artifact(root, '@kb-labs/core-runtime', '2.0.0', ''),
      artifact(root, '@kb-labs/sdk', '2.0.0', '', { peerDependencies: { '@kb-labs/core-runtime': '^2.0.0' } }),
    ];

    expect(() => buildReleaseIndex(staged, {
      channel: 'canary',
      workDir: join(root, 'work'),
      platformMemberPackages: ['@kb-labs/cli-bin'],
    })).toThrow(/required platform member @kb-labs\/cli-bin is absent/);
  });

  it('RI-05: rejects an SDK that declares no peer dependency on the platform', () => {
    const root = makeRoot();
    const staged = [
      artifact(root, '@kb-labs/core-runtime', '2.0.0', ''),
      artifact(root, '@kb-labs/sdk', '2.0.0', ''),
    ];

    expect(() => buildReleaseIndex(staged, { channel: 'canary', workDir: join(root, 'work') }))
      .toThrow(/does not declare a peer dependency/);
  });
});
