/**
 * A tiny real git workspace for the bundle-producer tests.
 *
 * It has to be a *real* repository: `release stage` creates a detached git
 * worktree and derives `treeSha256` from a written tree object, so a mocked
 * filesystem would test none of the behaviour that matters. Everything else is
 * kept as small as it can be while still exercising each classification the
 * release index knows about — platform, member, sdk, plugin, adapter, service.
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { canonicalSha256 } from '@kb-labs/release-manager-contracts';

import type { NormalizedBinary } from '../../bundle/binary-manifest.js';
import type { CandidateReleaseIntent } from '../../bundle/intent.js';
import { buildMutationPlan, mutationSha256 } from '../../bundle/mutations.js';
import type { PackageTarballer } from '../../bundle/package.js';
import type { ReleaseIndexSealer } from '../../bundle/seal.js';

export const FIXTURE_BASE_VERSION = '2.0.0';
export const FIXTURE_RELEASE_VERSION = '2.1.0';
export const FIXTURE_RELEASE_ID = `platform-${FIXTURE_RELEASE_VERSION}`;
export const FIXTURE_CANDIDATE_ID = `${FIXTURE_RELEASE_ID}-a`;

interface FixturePackage {
  name: string;
  dir: string;
  extra?: Record<string, unknown>;
  /** `dist/manifest.json` content when an object, `dist/manifest.js` when a string. */
  manifest?: Record<string, unknown> | string;
}

const PACKAGES: FixturePackage[] = [
  { name: '@kb-labs/core-runtime', dir: 'packages/core-runtime' },
  { name: '@kb-labs/core-contracts', dir: 'packages/core-contracts' },
  {
    name: '@kb-labs/sdk',
    dir: 'packages/sdk',
    extra: { peerDependencies: { '@kb-labs/core-runtime': '>=2.0.0 <3.0.0' } },
  },
  {
    name: '@kb-labs/commit-entry',
    dir: 'plugins/commit/entry',
    extra: { dependencies: { '@kb-labs/core-runtime': 'workspace:*' } },
    manifest: { schema: 'kb.plugin/3', id: '@kb-labs/commit', platform: { requires: ['cache'] } },
  },
  {
    name: '@kb-labs/workflow-daemon',
    dir: 'services/workflow',
    extra: { bin: { 'kb-workflow': './dist/index.js' } },
    manifest: 'var manifest = { schema: "kb.service/1", id: "workflow", runtime: { port: 7778 } }; export { manifest };',
  },
  {
    name: '@kb-labs/adapters-pino',
    dir: 'adapters/pino',
    manifest: 'const manifest={id:"pino-logger",implements:["ILogger"]}; export {manifest};',
  },
];

export interface FixtureBinary {
  id: string;
  os: 'linux' | 'darwin';
  arch: 'amd64' | 'arm64';
  content: string;
}

const BINARIES: FixtureBinary[] = [
  { id: 'kb-create', os: 'linux', arch: 'amd64', content: 'fixture-binary:kb-create:linux/amd64\n' },
  { id: 'kb-create', os: 'darwin', arch: 'arm64', content: 'fixture-binary:kb-create:darwin/arm64\n' },
];

export interface ReleaseFixture {
  repoRoot: string;
  intent: CandidateReleaseIntent;
  intentPath: string;
  plannedCommit: string;
  binariesDir: string;
  binaries: NormalizedBinary[];
  /** Deterministic packer: every call for a package returns byte-identical bytes. */
  tarballer: PackageTarballer;
  /** Deterministic index sealer standing in for kb-create's Go sealer. */
  indexSealer: ReleaseIndexSealer;
}

function run(cwd: string, command: string, args: string[]): void {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
}

function write(root: string, relativePath: string, content: string): void {
  const full = join(root, relativePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Packs each package once into a shared cache, then hands out copies.
 *
 * `npm`/`pnpm pack` embed mtimes, so packing twice never yields identical
 * bytes — a property of the packer, not of the bundle producer. Freezing the
 * bytes here keeps the determinism assertion pointed at what this PR owns:
 * everything the plugin computes from those bytes.
 */
function createCachingTarballer(cacheDir: string): PackageTarballer {
  mkdirSync(cacheDir, { recursive: true });
  const cache = new Map<string, string>();

  return ({ packageDir, name, version, destination }) => {
    const filename = `${name.replace('@', '').replace('/', '-')}-${version}.tgz`;
    const cached = cache.get(filename);
    const cachedPath = join(cacheDir, filename);

    if (!cached) {
      run(dirname(packageDir), 'tar', ['-czf', cachedPath, '-C', dirname(packageDir), basename(packageDir)]);
      // The extractor strips one component, so the archive root must be a
      // single directory — mirror what `npm pack` produces.
      cache.set(filename, cachedPath);
    }

    mkdirSync(destination, { recursive: true });
    copyFileSync(cachedPath, join(destination, filename));
    return filename;
  };
}

/**
 * Stand-in for `kb-create-release-index`.
 *
 * The real sealer is a Go binary that owns the `kb.create.release-index/v2`
 * format; tests must not require a Go toolchain, and what they need to observe
 * is that the plugin feeds it a deterministic export.
 */
export const deterministicIndexSealer: ReleaseIndexSealer = ({ exportValue, outputPath }) => {
  const sealed = {
    schema: 'kb.create.release-index/v2',
    ...exportValue,
    digest: canonicalSha256(exportValue),
  };
  writeFileSync(outputPath, `${JSON.stringify(sealed, null, 2)}\n`);
};

/** Creates the fixture repository and a matching, fully-formed candidate intent. */
export function createReleaseFixture(): ReleaseFixture {
  const root = mkdtempSync(join(tmpdir(), 'kb-release-fixture-'));
  const repoRoot = join(root, 'repo');
  mkdirSync(repoRoot, { recursive: true });

  run(repoRoot, 'git', ['init', '--initial-branch', 'master']);
  run(repoRoot, 'git', ['config', 'user.email', 'fixture@kb-labs.test']);
  run(repoRoot, 'git', ['config', 'user.name', 'KB Labs Fixture']);
  run(repoRoot, 'git', ['config', 'commit.gpgsign', 'false']);

  write(repoRoot, 'package.json', `${JSON.stringify({ name: 'kb-labs-fixture', version: '0.0.0', private: true }, null, 2)}\n`);

  for (const pkg of PACKAGES) {
    write(repoRoot, `${pkg.dir}/package.json`, `${JSON.stringify({
      name: pkg.name,
      version: FIXTURE_BASE_VERSION,
      ...pkg.extra,
    }, null, 2)}\n`);
    write(repoRoot, `${pkg.dir}/index.js`, `export const name = ${JSON.stringify(pkg.name)};\n`);
    if (typeof pkg.manifest === 'string') {
      write(repoRoot, `${pkg.dir}/dist/manifest.js`, pkg.manifest);
    } else if (pkg.manifest) {
      write(repoRoot, `${pkg.dir}/dist/manifest.json`, `${JSON.stringify(pkg.manifest)}\n`);
    }
  }

  run(repoRoot, 'git', ['add', '--all']);
  run(repoRoot, 'git', ['commit', '--no-verify', '--message', 'fixture: initial workspace']);
  const plannedCommit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();

  const binariesDir = join(root, 'binaries');
  mkdirSync(binariesDir, { recursive: true });
  const binaries: NormalizedBinary[] = BINARIES.map(binary => {
    const filename = `${binary.id}-${binary.os}-${binary.arch}`;
    const path = join(binariesDir, filename);
    writeFileSync(path, binary.content);
    chmodSync(path, 0o755);
    return {
      id: binary.id,
      os: binary.os,
      arch: binary.arch,
      filename,
      sha256: sha256(binary.content),
      url: `https://github.com/kb-labs-team/kb-labs/releases/download/v${FIXTURE_RELEASE_VERSION}-binaries/${filename}`,
    };
  });

  const packageSet = PACKAGES.map(pkg => ({ name: pkg.name, version: FIXTURE_RELEASE_VERSION }));
  const draft = {
    schema: 'kb.release-intent/1',
    operation: 'candidate',
    releaseId: FIXTURE_RELEASE_ID,
    candidateId: FIXTURE_CANDIDATE_ID,
    source: { plannedCommit, branch: 'master' },
    flow: 'platform',
    requestedTarget: 'canary',
    planSha256: sha256('fixture-plan'),
    mutationSha256: '0'.repeat(64),
    packageSet,
    signature: null,
  } as CandidateReleaseIntent;

  // The repository checkout is itself a git worktree, so the mutation plan can
  // be derived against it without staging anything — nothing is written here.
  const intent: CandidateReleaseIntent = {
    ...draft,
    mutationSha256: mutationSha256(buildMutationPlan(repoRoot, draft)),
  };

  const intentPath = join(root, 'intent.json');
  writeFileSync(intentPath, `${JSON.stringify(intent, null, 2)}\n`);

  return {
    repoRoot,
    intent,
    intentPath,
    plannedCommit,
    binariesDir,
    binaries,
    tarballer: createCachingTarballer(join(root, 'tarball-cache')),
    indexSealer: deterministicIndexSealer,
  };
}
