import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import { canonicalSha256, ReleaseBundleSchema, type ReleaseBundle } from '@kb-labs/release-manager-contracts';

export interface BundleVerificationResult {
  bundle: ReleaseBundle;
  verifiedFiles: number;
}

export type UnsealedReleaseBundle = Omit<ReleaseBundle, 'bundleSha256'>;

/** Seals a bundle manifest by hashing its canonical payload with bundleSha256 blanked. */
export function sealReleaseBundle(bundleDir: string, source: UnsealedReleaseBundle): ReleaseBundle {
  const bundleSha256 = canonicalSha256({ ...source, bundleSha256: '' });
  const bundle = ReleaseBundleSchema.parse({ ...source, bundleSha256 });
  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(resolveBundleFile(bundleDir, 'bundle.json'), `${JSON.stringify(bundle, null, 2)}\n`);
  return bundle;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function resolveBundleFile(bundleDir: string, relativePath: string): string {
  const root = resolve(bundleDir);
  const candidate = resolve(root, relativePath);
  if (!candidate.startsWith(`${root}${sep}`)) {
    throw new Error(`bundle file escapes bundle directory: ${relativePath}`);
  }
  return candidate;
}

/** Validates the manifest and every exact byte listed in a sealed bundle. */
export function verifyReleaseBundle(bundleDir: string, expectedBundleSha256?: string): BundleVerificationResult {
  const manifestPath = resolveBundleFile(bundleDir, 'bundle.json');
  const manifestBytes = readFileSync(manifestPath);
  const parsed = ReleaseBundleSchema.safeParse(JSON.parse(manifestBytes.toString('utf8')));
  if (!parsed.success) {
    throw new Error(`invalid release bundle: ${parsed.error.message}`);
  }
  if (expectedBundleSha256 && parsed.data.bundleSha256 !== expectedBundleSha256) {
    throw new Error(`bundle digest mismatch: expected ${expectedBundleSha256}, got ${parsed.data.bundleSha256}`);
  }
  const actualBundleSha256 = canonicalSha256({ ...parsed.data, bundleSha256: '' });
  if (parsed.data.bundleSha256 !== actualBundleSha256) {
    throw new Error('bundle manifest bundleSha256 does not match its canonical payload');
  }

  for (const file of parsed.data.files) {
    const path = resolveBundleFile(bundleDir, file.path);
    if (!statSync(path).isFile()) {
      throw new Error(`bundle inventory entry is not a file: ${file.path}`);
    }
    if (statSync(path).size !== file.size) {
      throw new Error(`bundle size mismatch for ${file.path}`);
    }
    if (sha256File(path) !== file.sha256) {
      throw new Error(`bundle checksum mismatch for ${file.path}`);
    }
  }
  return { bundle: parsed.data, verifiedFiles: parsed.data.files.length };
}
