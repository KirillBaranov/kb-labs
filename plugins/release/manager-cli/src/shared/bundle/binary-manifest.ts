/**
 * Binary-manifest normalization — migrated from the CI-owned
 * `tools/kb-create/scripts/prepare-binary-manifest.mjs` (cutover plan §6A.2,
 * execution plan PR 3 item 2).
 *
 * Converts exact GoReleaser checksum output into the binary half of the release
 * index. It never resolves a channel or a "latest" release: the tag and the
 * asset bytes are explicit inputs, so the manifest can only ever describe
 * artifacts that already exist.
 *
 * One deliberate change from the script: Windows targets are dropped. Decision
 * S0.3c narrowed the supported matrix to linux/darwin × amd64/arm64 and the
 * contract's `ReleaseBinaryOsSchema` enforces it, so a `kb-*-windows-*` asset is
 * now an unsupported target rather than a manifest entry the graph cannot node.
 */

import { readFileSync } from 'node:fs';

import type { ReleaseBinaryArchSchema, ReleaseBinaryOsSchema } from '@kb-labs/release-manager-contracts';
import type { z } from 'zod';

export type BinaryOs = z.infer<typeof ReleaseBinaryOsSchema>;
export type BinaryArch = z.infer<typeof ReleaseBinaryArchSchema>;

export interface NormalizedBinary {
  id: string;
  os: BinaryOs;
  arch: BinaryArch;
  filename: string;
  sha256: string;
  url: string;
  /** Set by the index builder to the release's platform version; mandatory in the graph. */
  version?: string;
}

export interface NormalizeBinaryChecksumsOptions {
  repository: string;
  releaseTag: string;
}

const CHECKSUM_LINE = /^([a-f0-9]{64})\s+(.+)$/i;
const ASSET_NAME = /^(kb-[a-z0-9-]+)-(darwin|linux|windows)-(amd64|arm64)(\.exe)?$/;

const SUPPORTED_OS = new Set<string>(['linux', 'darwin']);

export interface NormalizeBinaryChecksumsResult {
  binaries: NormalizedBinary[];
  /** Assets recognised as KB Labs binaries but outside the supported matrix. */
  unsupported: string[];
}

export function normalizeBinaryChecksums(
  checksums: string,
  options: NormalizeBinaryChecksumsOptions,
): NormalizeBinaryChecksumsResult {
  const binaries: NormalizedBinary[] = [];
  const unsupported: string[] = [];
  const seen = new Set<string>();

  for (const raw of checksums.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { continue; }
    const match = CHECKSUM_LINE.exec(line);
    if (!match) { continue; }

    const [, sha256, rawFilename] = match;
    // GoReleaser marks binary-mode entries with a leading `*`.
    const filename = rawFilename!.replace(/^\*+/, '');
    const target = ASSET_NAME.exec(filename);
    if (!target) { continue; }

    const [, id, os, arch] = target as unknown as [string, string, string, string];
    if (!SUPPORTED_OS.has(os)) {
      unsupported.push(filename);
      continue;
    }

    const key = `${id}:${os}/${arch}`;
    if (seen.has(key)) {
      throw new Error(`duplicate binary asset ${key}`);
    }
    seen.add(key);

    binaries.push({
      id,
      os: os as BinaryOs,
      arch: arch as BinaryArch,
      filename,
      sha256: sha256!.toLowerCase(),
      url: `https://github.com/${options.repository}/releases/download/${options.releaseTag}/${filename}`,
    });
  }

  if (binaries.length === 0) {
    throw new Error('checksums file contains no supported KB Labs binary assets');
  }

  binaries.sort((left, right) =>
    `${left.id}:${left.os}/${left.arch}`.localeCompare(`${right.id}:${right.os}/${right.arch}`));

  return { binaries, unsupported };
}

export function normalizeBinaryChecksumsFile(
  path: string,
  options: NormalizeBinaryChecksumsOptions,
): NormalizeBinaryChecksumsResult {
  return normalizeBinaryChecksums(readFileSync(path, 'utf8'), options);
}

/** Validates an already-normalized manifest, e.g. one supplied on disk by CI. */
export function assertBinaryManifest(binaries: unknown, platformVersion: string): NormalizedBinary[] {
  if (!Array.isArray(binaries)) {
    throw new Error('binary manifest must contain a binaries array');
  }
  for (const binary of binaries as NormalizedBinary[]) {
    for (const field of ['id', 'os', 'arch', 'url', 'filename', 'sha256'] as const) {
      if (!binary[field]) { throw new Error(`binary manifest entry is missing ${field}`); }
    }
    if (!SUPPORTED_OS.has(binary.os)) {
      throw new Error(`binary ${binary.id} targets unsupported os ${binary.os}`);
    }
    if (binary.version && binary.version !== platformVersion) {
      throw new Error(`binary ${binary.id} version ${binary.version} does not match platform ${platformVersion}`);
    }
  }
  return binaries as NormalizedBinary[];
}
