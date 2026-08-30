import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { sealReleaseBundle, verifyReleaseBundle } from '../release-bundle';

const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('verifyReleaseBundle', () => {
  let root: string;

  beforeEach(() => {
    root = join(tmpdir(), `release-bundle-${randomBytes(4).toString('hex')}`);
    mkdirSync(root, { recursive: true });
  });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function writeBundle(content = 'tarball'): string {
    writeFileSync(join(root, 'npm.tgz'), content);
    return sealReleaseBundle(root, {
      schema: 'kb.release-bundle/1', releaseId: 'platform-2.120.0', candidateId: 'candidate-1',
      intentSha256: 'b'.repeat(64), indexSha256: 'c'.repeat(64), treeSha256: 'd'.repeat(64),
      files: [{ path: 'npm.tgz', sha256: hash(content), size: Buffer.byteLength(content) }],
    }).bundleSha256;
  }

  it('accepts an exact external bundle digest and verified inventory', () => {
    const digest = writeBundle();
    expect(verifyReleaseBundle(root, digest).verifiedFiles).toBe(1);
  });

  it('seals the canonical manifest payload before verification', () => {
    writeFileSync(join(root, 'npm.tgz'), 'tarball');
    const bundle = sealReleaseBundle(root, {
      schema: 'kb.release-bundle/1', releaseId: 'platform-2.120.0', candidateId: 'candidate-1',
      intentSha256: 'b'.repeat(64), indexSha256: 'c'.repeat(64), treeSha256: 'd'.repeat(64),
      files: [{ path: 'npm.tgz', sha256: hash('tarball'), size: 7 }],
    });
    expect(verifyReleaseBundle(root, bundle.bundleSha256).bundle.bundleSha256).toBe(bundle.bundleSha256);
  });

  it('rejects altered bytes and a mismatched externally approved digest', () => {
    const digest = writeBundle();
    writeFileSync(join(root, 'npm.tgz'), 'altered');
    expect(() => verifyReleaseBundle(root, digest)).toThrow('checksum mismatch');
    expect(() => verifyReleaseBundle(root, 'e'.repeat(64))).toThrow('bundle digest mismatch');
  });
});
