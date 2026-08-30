/**
 * Coverage migrated from `tools/kb-create/scripts/prepare-binary-manifest.test.mjs`,
 * which was deleted together with the script it exercised.
 */

import { describe, expect, it } from 'vitest';

import { assertBinaryManifest, normalizeBinaryChecksums } from '../bundle/binary-manifest.js';

const OPTIONS = { repository: 'kb-labs-team/kb-labs', releaseTag: 'v2.3.4-binaries' };

describe('normalizeBinaryChecksums', () => {
  it('BM-01: creates exact binary URLs and hashes from GoReleaser checksums', () => {
    const { binaries } = normalizeBinaryChecksums(
      `${'a'.repeat(64)}  kb-create-linux-amd64\n`
      + `${'b'.repeat(64)}  kb-dev-darwin-arm64\n`
      + 'not-an-asset\n',
      OPTIONS,
    );

    expect(binaries).toEqual([
      {
        id: 'kb-create',
        os: 'linux',
        arch: 'amd64',
        filename: 'kb-create-linux-amd64',
        sha256: 'a'.repeat(64),
        url: 'https://github.com/kb-labs-team/kb-labs/releases/download/v2.3.4-binaries/kb-create-linux-amd64',
      },
      {
        id: 'kb-dev',
        os: 'darwin',
        arch: 'arm64',
        filename: 'kb-dev-darwin-arm64',
        sha256: 'b'.repeat(64),
        url: 'https://github.com/kb-labs-team/kb-labs/releases/download/v2.3.4-binaries/kb-dev-darwin-arm64',
      },
    ]);
  });

  it('BM-02: drops Windows assets, which decision S0.3c removed from the supported matrix', () => {
    const { binaries, unsupported } = normalizeBinaryChecksums(
      `${'a'.repeat(64)}  kb-create-linux-amd64\n${'b'.repeat(64)}  kb-dev-windows-amd64.exe\n`,
      OPTIONS,
    );

    expect(binaries.map(binary => binary.filename)).toEqual(['kb-create-linux-amd64']);
    expect(unsupported).toEqual(['kb-dev-windows-amd64.exe']);
  });

  it('BM-03: strips GoReleaser binary-mode markers and sorts by target', () => {
    const { binaries } = normalizeBinaryChecksums(
      `${'b'.repeat(64)} *kb-dev-linux-arm64\n${'a'.repeat(64)} *kb-create-darwin-amd64\n`,
      OPTIONS,
    );

    expect(binaries.map(binary => `${binary.id}:${binary.os}/${binary.arch}`))
      .toEqual(['kb-create:darwin/amd64', 'kb-dev:linux/arm64']);
  });

  it('BM-04: rejects a duplicate target rather than picking one silently', () => {
    expect(() => normalizeBinaryChecksums(
      `${'a'.repeat(64)}  kb-create-linux-amd64\n${'b'.repeat(64)}  kb-create-linux-amd64\n`,
      OPTIONS,
    )).toThrow(/duplicate binary asset kb-create:linux\/amd64/);
  });

  it('BM-05: rejects a checksums file with no supported asset', () => {
    expect(() => normalizeBinaryChecksums(`${'a'.repeat(64)}  README.md\n`, OPTIONS))
      .toThrow(/no supported KB Labs binary assets/);
  });
});

describe('assertBinaryManifest', () => {
  const entry = {
    id: 'kb-create',
    os: 'linux' as const,
    arch: 'amd64' as const,
    filename: 'kb-create-linux-amd64',
    sha256: 'a'.repeat(64),
    url: 'https://example.test/kb-create-linux-amd64',
  };

  it('BM-06: rejects an entry missing a mandatory field', () => {
    expect(() => assertBinaryManifest([{ ...entry, url: '' }], '2.1.0'))
      .toThrow(/missing url/);
  });

  it('BM-07: rejects a binary version that disagrees with the platform version', () => {
    expect(() => assertBinaryManifest([{ ...entry, version: '2.0.0' }], '2.1.0'))
      .toThrow(/does not match platform 2\.1\.0/);
  });

  it('BM-08: rejects an unsupported os even when every field is present', () => {
    expect(() => assertBinaryManifest([{ ...entry, os: 'windows' }], '2.1.0'))
      .toThrow(/unsupported os windows/);
  });

  it('BM-09: rejects a manifest that is not an array', () => {
    expect(() => assertBinaryManifest({ binaries: [] }, '2.1.0')).toThrow(/must contain a binaries array/);
  });
});
