/**
 * Command-backed implementations of the two immutable publication targets.
 *
 * `npm` and `gh` are the transports the old `release-deliver-candidate.yml`
 * used, and there is no reason to replace them — the problem with that workflow
 * was never the tools, it was that the *decisions* lived in its shell steps.
 * Here the shell is reduced to a transport with no policy in it: these classes
 * read remote state and move bytes, and every idempotency, conflict and
 * ordering decision is made by `ci-delivery.ts` above them.
 *
 * `CommandRunner` is injected so the clients are unit-testable without a
 * registry or a GitHub token, and so the plugin's own process broker — not this
 * file — decides what may be executed.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { transientFailure } from './adapters.js';
import {
  assertNotChannelDistTag,
  sha256Of,
  type NpmPackageState,
  type NpmRegistry,
  type ReleaseAssetStore,
  type RemoteAsset,
} from './delivery-targets.js';

export interface CommandResultShape {
  status: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: readonly string[], options?: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}) => CommandResultShape;

export const spawnCommandRunner: CommandRunner = (command, args, options) => {
  const result = spawnSync(command, [...args], {
    encoding: 'utf8',
    ...(options?.cwd ? { cwd: options.cwd } : {}),
    ...(options?.env ? { env: options.env } : {}),
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
};

/**
 * npm registry access through the `npm` CLI.
 *
 * Every failure is classified transient. That is not laziness: an npm command
 * failing tells us the *call* failed, not that the artifact is wrong, and
 * §PR 5 item 7 is explicit that an ambiguous infrastructure failure must not
 * burn a SemVer. The genuinely terminal cases — a version that exists with
 * different bytes, a channel dist-tag being touched — are detected from the
 * state this class reports, in the layer that knows what the bytes should be.
 */
export class ShellNpmRegistry implements NpmRegistry {
  constructor(private readonly options: {
    registry?: string;
    run?: CommandRunner;
    env?: NodeJS.ProcessEnv;
  } = {}) {}

  private get registry(): string {
    return this.options.registry ?? 'https://registry.npmjs.org';
  }

  private exec(args: readonly string[]): CommandResultShape {
    return (this.options.run ?? spawnCommandRunner)('npm', [...args, '--registry', this.registry], {
      ...(this.options.env ? { env: this.options.env } : {}),
    });
  }

  async read(name: string): Promise<NpmPackageState | null> {
    const result = this.exec(['view', name, '--json']);
    if (result.status !== 0) {
      // npm exits non-zero both for "no such package" and for a network fault,
      // and the two are distinguishable only from the message. Guessing wrong
      // in the "absent" direction would publish over an existing version.
      if (/E404|404 Not Found|is not in the npm registry/i.test(result.stderr + result.stdout)) { return null; }
      throw transientFailure(`npm view ${name} failed: ${(result.stderr || result.stdout).trim()}`);
    }
    let payload: { versions?: string[] | string; 'dist-tags'?: Record<string, string>; dist?: { integrity?: string } };
    try {
      payload = JSON.parse(result.stdout) as typeof payload;
    } catch (error) {
      throw transientFailure(`npm view ${name} returned unparsable JSON: ${(error as Error).message}`);
    }
    const versions = Array.isArray(payload.versions) ? payload.versions : payload.versions ? [payload.versions] : [];
    return {
      name,
      // The registry reports integrity, not a bare sha256 of the tarball, so a
      // per-version digest needs its own lookup; callers that must compare
      // bytes do it through `tarballSha256`.
      versions: versions.map(version => ({ version, sha256: '' })),
      distTags: payload['dist-tags'] ?? {},
    };
  }

  /**
   * Digest of a published tarball, downloaded rather than trusted.
   *
   * Used to turn a "this version already exists" observation into either
   * `reused` or a hard conflict.
   */
  async tarballSha256(name: string, version: string): Promise<string | null> {
    const meta = this.exec(['view', `${name}@${version}`, 'dist.tarball', '--json']);
    if (meta.status !== 0) { return null; }
    const url = JSON.parse(meta.stdout || '""') as string;
    if (!url) { return null; }
    const dir = mkdtempSync(join(tmpdir(), 'kb-npm-verify-'));
    try {
      const target = join(dir, 'package.tgz');
      const fetched = (this.options.run ?? spawnCommandRunner)('curl', ['-fsSL', url, '-o', target]);
      if (fetched.status !== 0) { return null; }
      return sha256Of(readFileSync(target));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  async publish(input: { name: string; version: string; tag: string; tarballPath: string; sha256: string }): Promise<void> {
    assertNotChannelDistTag(input.tag);
    const result = this.exec(['publish', input.tarballPath, '--tag', input.tag, '--access', 'public']);
    if (result.status !== 0) {
      throw transientFailure(`npm publish ${input.name}@${input.version} failed: ${(result.stderr || result.stdout).trim()}`);
    }
  }

  async moveDistTag(input: { name: string; version: string; tag: string }): Promise<void> {
    const result = this.exec(['dist-tag', 'add', `${input.name}@${input.version}`, input.tag]);
    if (result.status !== 0) {
      throw transientFailure(`npm dist-tag add ${input.name}@${input.tag} failed: ${(result.stderr || result.stdout).trim()}`);
    }
  }
}

/**
 * GitHub Releases assets through the `gh` CLI.
 *
 * `--clobber` appears nowhere, and `upload` refuses when the asset is already
 * present: §6A.5 permits "publish or observe it is already identical" and
 * nothing else. Replacing a published asset would change what an already-issued
 * immutable descriptor resolves to.
 */
export class GhReleaseAssetStore implements ReleaseAssetStore {
  constructor(private readonly options: { repository: string; run?: CommandRunner; env?: NodeJS.ProcessEnv }) {}

  private exec(args: readonly string[]): CommandResultShape {
    return (this.options.run ?? spawnCommandRunner)('gh', args, {
      ...(this.options.env ? { env: this.options.env } : {}),
    });
  }

  async read(tag: string): Promise<readonly RemoteAsset[] | null> {
    const result = this.exec(['release', 'view', tag, '--repo', this.options.repository, '--json', 'assets']);
    if (result.status !== 0) {
      if (/release not found|not found/i.test(result.stderr + result.stdout)) { return null; }
      throw transientFailure(`gh release view ${tag} failed: ${(result.stderr || result.stdout).trim()}`);
    }
    const payload = JSON.parse(result.stdout || '{}') as { assets?: Array<{ name: string; url?: string; apiUrl?: string }> };
    // GitHub does not report asset digests, so the recorded digest is the one
    // the caller verified by downloading — `ci-delivery.ts` always reads back.
    return (payload.assets ?? []).map(asset => ({
      name: asset.name,
      sha256: '',
      url: asset.url ?? asset.apiUrl ?? `https://github.com/${this.options.repository}/releases/download/${tag}/${asset.name}`,
    }));
  }

  async create(input: { tag: string; title: string; notes: string }): Promise<void> {
    const result = this.exec([
      'release', 'create', input.tag, '--repo', this.options.repository,
      '--title', input.title, '--notes', input.notes,
    ]);
    if (result.status !== 0) {
      throw transientFailure(`gh release create ${input.tag} failed: ${(result.stderr || result.stdout).trim()}`);
    }
  }

  async upload(input: { tag: string; name: string; path: string; sha256: string }): Promise<RemoteAsset> {
    const result = this.exec(['release', 'upload', input.tag, input.path, '--repo', this.options.repository]);
    if (result.status !== 0) {
      throw transientFailure(`gh release upload ${input.tag}/${input.name} failed: ${(result.stderr || result.stdout).trim()}`);
    }
    return {
      name: input.name,
      sha256: input.sha256,
      url: `https://github.com/${this.options.repository}/releases/download/${input.tag}/${input.name}`,
    };
  }

  async download(input: { tag: string; name: string }): Promise<Buffer> {
    const dir = mkdtempSync(join(tmpdir(), 'kb-asset-verify-'));
    try {
      const result = this.exec([
        'release', 'download', input.tag, '--repo', this.options.repository,
        '--pattern', input.name, '--dir', dir,
      ]);
      if (result.status !== 0) {
        throw transientFailure(`gh release download ${input.tag}/${input.name} failed: ${(result.stderr || result.stdout).trim()}`);
      }
      return readFileSync(join(dir, input.name));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
