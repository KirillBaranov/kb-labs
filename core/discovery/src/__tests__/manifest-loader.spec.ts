import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadManifest } from '../manifest-loader.js';
import { DiagnosticCollector } from '../diagnostics.js';

describe('loadManifest', () => {
  let tmpDir: string;
  let diag: DiagnosticCollector;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-manifest-test-'));
    diag = new DiagnosticCollector();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ── Resolution via kb.plugin.json ────────────────────────────────────

  it('loads manifest from kb.plugin.json', async () => {
    const pkgDir = path.join(tmpDir, 'my-plugin');
    await fs.mkdir(pkgDir, { recursive: true });

    const manifest = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/my-plugin',
      version: '1.0.0',
    };
    await fs.writeFile(path.join(pkgDir, 'kb.plugin.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: '@kb-labs/my-plugin' }));

    const result = await loadManifest(pkgDir, diag);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('@kb-labs/my-plugin');
    expect(result!.version).toBe('1.0.0');
    expect(diag.hasErrors()).toBe(false);
  });

  it('returns null with warning when kb.plugin.json is not valid ManifestV3', async () => {
    const pkgDir = path.join(tmpDir, 'bad-manifest');
    await fs.mkdir(pkgDir, { recursive: true });

    // Missing schema field → not a valid ManifestV3
    await fs.writeFile(path.join(pkgDir, 'kb.plugin.json'), JSON.stringify({ id: 'x', version: '1.0.0' }));
    await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'x' }));

    const result = await loadManifest(pkgDir, diag);

    expect(result).toBeNull();
    const warning = diag.getEvents().find(d => d.code === 'MANIFEST_VALIDATION_ERROR');
    expect(warning).toBeDefined();
  });

  // ── No manifest found ────────────────────────────────────────────────

  it('returns null with MANIFEST_NOT_FOUND when no manifest source exists', async () => {
    const pkgDir = path.join(tmpDir, 'empty-plugin');
    await fs.mkdir(pkgDir, { recursive: true });
    // No kb.plugin.json, no package.json with manifest field, no dist/index.js
    await fs.writeFile(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'empty' }));

    const result = await loadManifest(pkgDir, diag);

    expect(result).toBeNull();
    const notFound = diag.getEvents().find(d => d.code === 'MANIFEST_NOT_FOUND');
    expect(notFound).toBeDefined();
    expect(notFound!.severity).toBe('error');
    expect(notFound!.remediation).toContain('kb.plugin.json');
  });

  // ── Resolution via package.json field ────────────────────────────────

  it('loads manifest from package.json kbLabs.manifest field', async () => {
    const pkgDir = path.join(tmpDir, 'pkg-field');
    await fs.mkdir(pkgDir, { recursive: true });

    const manifest = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/pkg-field',
      version: '2.0.0',
    };
    const manifestFile = 'custom-manifest.json';
    await fs.writeFile(path.join(pkgDir, manifestFile), JSON.stringify(manifest));
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@kb-labs/pkg-field', kbLabs: { manifest: `./${manifestFile}` } }),
    );

    const result = await loadManifest(pkgDir, diag);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('@kb-labs/pkg-field');
    expect(result!.version).toBe('2.0.0');
  });

  it('loads manifest from package.json kb.manifest field', async () => {
    const pkgDir = path.join(tmpDir, 'kb-field');
    await fs.mkdir(pkgDir, { recursive: true });

    const manifest = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/kb-field',
      version: '3.0.0',
    };
    await fs.writeFile(path.join(pkgDir, 'manifest.json'), JSON.stringify(manifest));
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: '@kb-labs/kb-field', kb: { manifest: './manifest.json' } }),
    );

    const result = await loadManifest(pkgDir, diag);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('@kb-labs/kb-field');
  });

  // ── Path traversal guard ─────────────────────────────────────────────

  it('rejects manifest path that escapes package root (path traversal)', async () => {
    const pkgDir = path.join(tmpDir, 'traversal');
    await fs.mkdir(pkgDir, { recursive: true });
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'x', kbLabs: { manifest: '../../etc/passwd' } }),
    );

    const result = await loadManifest(pkgDir, diag);

    expect(result).toBeNull();
    const traversalError = diag.getEvents().find(d =>
      d.code === 'MANIFEST_VALIDATION_ERROR' && d.message.includes('path traversal'),
    );
    expect(traversalError).toBeDefined();
    expect(traversalError!.severity).toBe('error');
  });

  // ── Missing package.json (continues to next strategy) ────────────────

  it('continues to kb.plugin.json when package.json is missing', async () => {
    const pkgDir = path.join(tmpDir, 'no-pkg-json');
    await fs.mkdir(pkgDir, { recursive: true });

    const manifest = {
      schema: 'kb.plugin/3',
      id: '@kb-labs/fallback',
      version: '1.0.0',
    };
    await fs.writeFile(path.join(pkgDir, 'kb.plugin.json'), JSON.stringify(manifest));

    const result = await loadManifest(pkgDir, diag);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('@kb-labs/fallback');
  });

  // ── Priority order (package.json field wins over kb.plugin.json) ─────

  it('prefers package.json manifest field over kb.plugin.json', async () => {
    const pkgDir = path.join(tmpDir, 'priority');
    await fs.mkdir(pkgDir, { recursive: true });

    // kb.plugin.json has different ID
    await fs.writeFile(
      path.join(pkgDir, 'kb.plugin.json'),
      JSON.stringify({ schema: 'kb.plugin/3', id: 'from-kb-plugin-json', version: '1.0.0' }),
    );
    // package.json field points to a different manifest
    const customManifest = { schema: 'kb.plugin/3', id: 'from-pkg-field', version: '1.0.0' };
    await fs.writeFile(path.join(pkgDir, 'custom.json'), JSON.stringify(customManifest));
    await fs.writeFile(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'priority', kbLabs: { manifest: './custom.json' } }),
    );

    const result = await loadManifest(pkgDir, diag);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('from-pkg-field');
  });
});
