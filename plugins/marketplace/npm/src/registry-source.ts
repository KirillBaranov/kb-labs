/**
 * @module @kb-labs/marketplace-npm/registry-source
 * KB Labs Registry PackageSource implementation.
 * Resolves/installs packages from the KB Registry (kb:handle/name spec).
 */

import { createHash, createVerify } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { extract } from 'tar';
import * as os from 'node:os';
import type { PackageSource, ResolvedPackage, InstalledPackage } from '@kb-labs/marketplace-contracts';
import type { EntitySignature } from '@kb-labs/core-discovery';

export class RegistryPackageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'RegistryPackageError';
    this.code = code;
  }
}

export interface RegistrySourceOptions {
  /** Base URL of the registry (e.g. https://registry.kblabs.ru) */
  registryUrl: string;
  /** Bearer token for authenticated (private) package access */
  authToken?: string;
  /** Share token for token-based private access */
  shareToken?: string;
  /** Ed25519 public key (PEM) for signature verification */
  signingPublicKey?: string;
}

export class RegistryPackageSource implements PackageSource {
  private readonly baseUrl: string;
  private readonly authToken?: string;
  private readonly shareToken?: string;
  private readonly signingPublicKey?: string;

  constructor(opts: RegistrySourceOptions) {
    this.baseUrl = opts.registryUrl.replace(/\/$/, '');
    this.authToken = opts.authToken;
    this.shareToken = opts.shareToken;
    this.signingPublicKey = opts.signingPublicKey;
  }

  /** Returns true if spec is a kb: registry spec */
  static accepts(spec: string): boolean {
    return spec.startsWith('kb:');
  }

  /** Parse 'kb:handle/name[@version]' → { handle, name, version }
   *  Handles scoped package names like kb:handle/@scope/name[@version].
   */
  static parseSpec(spec: string): { handle: string; name: string; version: string } {
    const raw = spec.slice(3); // strip 'kb:'
    const firstSlash = raw.indexOf('/');
    if (firstSlash === -1) {
      throw new RegistryPackageError('INVALID_SPEC', `Invalid kb: spec '${spec}'. Expected kb:handle/name[@version]`);
    }
    const handle = raw.slice(0, firstSlash);
    const nameAndVersion = raw.slice(firstSlash + 1);

    // Find version separator: last '@' that appears after the package name.
    // For scoped names (@scope/pkg), skip the leading '@' and the slash that follows it.
    let versionAtIdx = -1;
    if (nameAndVersion.startsWith('@')) {
      // scoped: @scope/pkg[@version] — look for '@' after the second '/'
      const secondSlash = nameAndVersion.indexOf('/', 1);
      if (secondSlash !== -1) {
        versionAtIdx = nameAndVersion.indexOf('@', secondSlash + 1);
      }
    } else {
      versionAtIdx = nameAndVersion.indexOf('@');
    }

    const name = versionAtIdx > 0 ? nameAndVersion.slice(0, versionAtIdx) : nameAndVersion;
    const version = versionAtIdx > 0 ? nameAndVersion.slice(versionAtIdx + 1) : 'latest';

    if (!handle || !name) {
      throw new RegistryPackageError('INVALID_SPEC', `Invalid kb: spec '${spec}'. Expected kb:handle/name[@version]`);
    }
    return { handle, name, version };
  }

  async resolve(spec: string): Promise<ResolvedPackage> {
    const { handle, name, version } = RegistryPackageSource.parseSpec(spec);
    const url = `${this.baseUrl}/api/v1/packages/${handle}/${encodeURIComponent(name)}`;
    const resp = await this.fetch(url);
    if (!resp.ok) {
      throw new RegistryPackageError('PACKAGE_NOT_FOUND', `Package ${handle}/${name} not found in registry`);
    }
    const entry = await resp.json() as { versions?: Array<{ version: string; integrity: string; yanked?: boolean; signature?: EntitySignature }> };

    const versions = entry.versions ?? [];
    const resolved = version === 'latest'
      ? versions.filter(v => !v.yanked).at(-1)
      : versions.find(v => v.version === version);

    if (!resolved) {
      throw new RegistryPackageError('VERSION_NOT_FOUND', `Version ${version} not found for ${handle}/${name}`);
    }
    if (resolved.yanked) {
      throw new RegistryPackageError('VERSION_YANKED', `Version ${version} of ${handle}/${name} has been yanked`);
    }

    return {
      id: `${handle}/${name}`,
      version: resolved.version,
      integrity: resolved.integrity,
      signature: resolved.signature,
      source: 'marketplace',
      downloadUrl: `${this.baseUrl}/api/v1/packages/${handle}/${encodeURIComponent(name)}/${resolved.version}/tarball`,
    };
  }

  async install(pkg: ResolvedPackage, root: string): Promise<InstalledPackage> {
    if (!pkg.downloadUrl) {
      throw new RegistryPackageError('NO_DOWNLOAD_URL', 'Missing downloadUrl in ResolvedPackage');
    }

    const resp = await this.fetch(pkg.downloadUrl);
    if (!resp.ok) {
      throw new RegistryPackageError('DOWNLOAD_FAILED', `Failed to download ${pkg.id}@${pkg.version}: ${resp.status}`);
    }

    const tarball = Buffer.from(await resp.arrayBuffer());

    // Verify integrity
    const actualIntegrity = `sha256-${createHash('sha256').update(tarball).digest('base64')}`;
    if (pkg.integrity && actualIntegrity !== pkg.integrity) {
      throw new RegistryPackageError('INTEGRITY_MISMATCH', `Integrity mismatch for ${pkg.id}@${pkg.version}`);
    }

    // Verify platform signature (for trusted packages)
    if (pkg.signature) {
      this.verifySignature(tarball, pkg.integrity, pkg.signature, pkg.id, pkg.version);
    }

    // Extract to node_modules (write tarball to temp file first — tar requires a path)
    const packageRoot = path.join(root, 'node_modules', pkg.id);
    await fs.mkdir(packageRoot, { recursive: true });
    const tmpFile = path.join(os.tmpdir(), `kb-registry-${Date.now()}.tgz`);
    try {
      await fs.writeFile(tmpFile, tarball);
      await extract({ file: tmpFile, cwd: packageRoot, strip: 1 });
    } finally {
      await fs.unlink(tmpFile).catch(() => { /* ignore */ });
    }

    return { id: pkg.id, version: pkg.version, packageRoot, integrity: actualIntegrity };
  }

  withShareToken(token: string): RegistryPackageSource {
    return new RegistryPackageSource({
      registryUrl: this.baseUrl,
      authToken: this.authToken,
      shareToken: token,
      signingPublicKey: this.signingPublicKey,
    });
  }

  async remove(_packageId: string, _root: string): Promise<void> {
    // Removal delegates to npm/fs — RegistryPackageSource doesn't manage node_modules cleanup
    throw new RegistryPackageError('UNSUPPORTED', 'Use npm source for remove operations');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async fetch(url: string): Promise<Response> {
    const headers: Record<string, string> = {};
    if (this.authToken) { headers['Authorization'] = `Bearer ${this.authToken}`; }
    if (this.shareToken) { headers['X-Share-Token'] = this.shareToken; }
    return globalThis.fetch(url, { headers });
  }

  private verifySignature(
    tarball: Buffer,
    integrity: string,
    signature: EntitySignature,
    id: string,
    version: string,
  ): void {
    if (!this.signingPublicKey) { return; } // no key = skip verification
    const payload = Buffer.from(JSON.stringify({ integrity, pkg: `${id}@${version}` }));
    const verify = createVerify('sha256');
    verify.update(payload);
    const valid = verify.verify(
      { key: this.signingPublicKey, format: 'pem' },
      Buffer.from(signature.value, 'base64'),
    );
    if (!valid) {
      throw new RegistryPackageError('SIGNATURE_INVALID', `Platform signature invalid for ${id}@${version}`);
    }
  }
}
