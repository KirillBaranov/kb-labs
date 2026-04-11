import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import { computePackageIntegrity, parseIntegrity } from '../integrity.js';

describe('computePackageIntegrity', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-integrity-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('computes sha256 SRI hash of package.json', async () => {
    const pkgContent = JSON.stringify({ name: 'test', version: '1.0.0' });
    await fs.writeFile(path.join(tmpDir, 'package.json'), pkgContent);

    const result = await computePackageIntegrity(tmpDir);

    const expected = `sha256-${crypto.createHash('sha256').update(Buffer.from(pkgContent)).digest('base64')}`;
    expect(result).toBe(expected);
  });

  it('produces deterministic output for same content', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{"x":1}');

    const a = await computePackageIntegrity(tmpDir);
    const b = await computePackageIntegrity(tmpDir);

    expect(a).toBe(b);
  });

  it('produces different hash for different content', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{"v":"1.0.0"}');
    const hash1 = await computePackageIntegrity(tmpDir);

    await fs.writeFile(path.join(tmpDir, 'package.json'), '{"v":"2.0.0"}');
    const hash2 = await computePackageIntegrity(tmpDir);

    expect(hash1).not.toBe(hash2);
  });

  it('throws when package.json is missing', async () => {
    await expect(computePackageIntegrity(tmpDir)).rejects.toThrow();
  });

  it('starts with sha256- prefix', async () => {
    await fs.writeFile(path.join(tmpDir, 'package.json'), '{}');
    const result = await computePackageIntegrity(tmpDir);

    expect(result).toMatch(/^sha256-/);
  });
});

describe('parseIntegrity', () => {
  it('parses valid sha256 integrity string', () => {
    const result = parseIntegrity('sha256-abc123');
    expect(result).toEqual({ algorithm: 'sha256', hash: 'abc123' });
  });

  it('parses sha512 integrity string', () => {
    const result = parseIntegrity('sha512-longhashhere');
    expect(result).toEqual({ algorithm: 'sha512', hash: 'longhashhere' });
  });

  it('returns null for string without dash', () => {
    expect(parseIntegrity('nohash')).toBeNull();
  });

  it('returns null for string starting with dash', () => {
    expect(parseIntegrity('-nope')).toBeNull();
  });

  it('returns null for string ending with dash', () => {
    expect(parseIntegrity('sha256-')).toBeNull();
  });

  it('handles hash with dashes inside', () => {
    const result = parseIntegrity('sha256-abc-def-ghi');
    expect(result).toEqual({ algorithm: 'sha256', hash: 'abc-def-ghi' });
  });
});
