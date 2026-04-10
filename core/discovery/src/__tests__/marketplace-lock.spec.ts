import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  readMarketplaceLock,
  writeMarketplaceLock,
  addToMarketplaceLock,
  removeFromMarketplaceLock,
  createEmptyLock,
  createMarketplaceEntry,
} from '../marketplace-lock.js';
import { DiagnosticCollector } from '../diagnostics.js';

describe('marketplace-lock', () => {
  let tmpDir: string;
  let diag: DiagnosticCollector;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-lock-test-'));
    diag = new DiagnosticCollector();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('readMarketplaceLock', () => {
    it('returns null and info diagnostic when file does not exist', async () => {
      const result = await readMarketplaceLock(tmpDir, diag);
      expect(result).toBeNull();
      expect(diag.getEvents()).toHaveLength(1);
      expect(diag.getEvents()[0]!.code).toBe('LOCK_NOT_FOUND');
      expect(diag.getEvents()[0]!.severity).toBe('info');
    });

    it('returns null with error on invalid JSON', async () => {
      await fs.mkdir(path.join(tmpDir, '.kb'), { recursive: true });
      await fs.writeFile(path.join(tmpDir, '.kb', 'marketplace.lock'), 'not json', 'utf-8');

      const result = await readMarketplaceLock(tmpDir, diag);
      expect(result).toBeNull();
      expect(diag.getEvents()[0]!.code).toBe('LOCK_PARSE_ERROR');
    });

    it('returns null with error on wrong schema', async () => {
      await fs.mkdir(path.join(tmpDir, '.kb'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, '.kb', 'marketplace.lock'),
        JSON.stringify({ schema: 'wrong', installed: {} }),
        'utf-8',
      );

      const result = await readMarketplaceLock(tmpDir, diag);
      expect(result).toBeNull();
      expect(diag.getEvents()[0]!.code).toBe('LOCK_SCHEMA_INVALID');
    });

    it('reads valid lock file', async () => {
      const lock = createEmptyLock();
      lock.installed['@kb-labs/test'] = createMarketplaceEntry({
        version: '1.0.0',
        integrity: 'sha256-abc',
        resolvedPath: './node_modules/@kb-labs/test',
        source: 'marketplace',
        primaryKind: 'plugin',
      provides: ['plugin'],
      });

      await fs.mkdir(path.join(tmpDir, '.kb'), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, '.kb', 'marketplace.lock'),
        JSON.stringify(lock, null, 2),
        'utf-8',
      );

      const result = await readMarketplaceLock(tmpDir, diag);
      expect(result).not.toBeNull();
      expect(result!.schema).toBe('kb.marketplace/2');
      expect(result!.installed['@kb-labs/test']).toBeDefined();
      expect(result!.installed['@kb-labs/test']!.version).toBe('1.0.0');
      expect(diag.hasErrors()).toBe(false);
    });
  });

  describe('writeMarketplaceLock', () => {
    it('creates .kb dir and writes atomically', async () => {
      const lock = createEmptyLock();
      await writeMarketplaceLock(tmpDir, lock);

      const content = await fs.readFile(path.join(tmpDir, '.kb', 'marketplace.lock'), 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.schema).toBe('kb.marketplace/2');
      expect(parsed.installed).toEqual({});
    });
  });

  describe('addToMarketplaceLock', () => {
    it('creates lock file if it does not exist', async () => {
      const entry = createMarketplaceEntry({
        version: '2.0.0',
        integrity: 'sha256-xyz',
        resolvedPath: './node_modules/@kb-labs/new',
        source: 'marketplace',
        primaryKind: 'plugin',
      provides: ['plugin', 'cli-command'],
      });

      const result = await addToMarketplaceLock(tmpDir, '@kb-labs/new', entry);
      expect(result.installed['@kb-labs/new']).toBeDefined();
      expect(result.installed['@kb-labs/new']!.version).toBe('2.0.0');
      expect(result.installed['@kb-labs/new']!.provides).toEqual(['plugin', 'cli-command']);

      // Verify written to disk
      const diskLock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(diskLock!.installed['@kb-labs/new']!.version).toBe('2.0.0');
    });

    it('adds to existing lock without overwriting others', async () => {
      const entry1 = createMarketplaceEntry({
        version: '1.0.0', integrity: 'sha256-a',
        resolvedPath: './a', source: 'marketplace', primaryKind: 'plugin',
      provides: ['plugin'],
      });
      const entry2 = createMarketplaceEntry({
        version: '2.0.0', integrity: 'sha256-b',
        resolvedPath: './b', source: 'local', primaryKind: 'plugin',
      provides: ['plugin', 'workflow'],
      });

      await addToMarketplaceLock(tmpDir, '@kb-labs/a', entry1);
      await addToMarketplaceLock(tmpDir, '@kb-labs/b', entry2);

      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(Object.keys(lock!.installed)).toHaveLength(2);
      expect(lock!.installed['@kb-labs/a']!.version).toBe('1.0.0');
      expect(lock!.installed['@kb-labs/b']!.source).toBe('local');
    });
  });

  describe('removeFromMarketplaceLock', () => {
    it('returns false if lock does not exist', async () => {
      const result = await removeFromMarketplaceLock(tmpDir, '@kb-labs/none');
      expect(result).toBe(false);
    });

    it('returns false if package not in lock', async () => {
      const entry = createMarketplaceEntry({
        version: '1.0.0', integrity: 'sha256-a',
        resolvedPath: './a', source: 'marketplace', primaryKind: 'plugin',
      provides: ['plugin'],
      });
      await addToMarketplaceLock(tmpDir, '@kb-labs/a', entry);

      const result = await removeFromMarketplaceLock(tmpDir, '@kb-labs/missing');
      expect(result).toBe(false);
    });

    it('removes existing entry and persists', async () => {
      const entry = createMarketplaceEntry({
        version: '1.0.0', integrity: 'sha256-a',
        resolvedPath: './a', source: 'marketplace', primaryKind: 'plugin',
      provides: ['plugin'],
      });
      await addToMarketplaceLock(tmpDir, '@kb-labs/a', entry);

      const result = await removeFromMarketplaceLock(tmpDir, '@kb-labs/a');
      expect(result).toBe(true);

      const lock = await readMarketplaceLock(tmpDir, new DiagnosticCollector());
      expect(lock!.installed['@kb-labs/a']).toBeUndefined();
    });
  });

  describe('createMarketplaceEntry', () => {
    it('sets installedAt to current time', () => {
      const before = new Date().toISOString();
      const entry = createMarketplaceEntry({
        version: '1.0.0', integrity: 'sha256-test',
        resolvedPath: './test', source: 'local', primaryKind: 'plugin',
      provides: ['plugin'],
      });
      const after = new Date().toISOString();

      expect(entry.installedAt >= before).toBe(true);
      expect(entry.installedAt <= after).toBe(true);
      expect(entry.source).toBe('local');
    });

    it('sets primaryKind from opts', () => {
      const entry = createMarketplaceEntry({
        version: '1.0.0', integrity: 'sha256-test',
        resolvedPath: './test', source: 'local', primaryKind: 'adapter',
        provides: ['adapter'],
      });
      expect(entry.primaryKind).toBe('adapter');
    });

    it('defaults enabled to true', () => {
      const entry = createMarketplaceEntry({
        version: '1.0.0', integrity: 'sha256-test',
        resolvedPath: './test', source: 'local', primaryKind: 'plugin',
        provides: ['plugin'],
      });
      expect(entry.enabled).toBe(true);
    });

    it('includes signature when provided', () => {
      const entry = createMarketplaceEntry({
        version: '1.0.0', integrity: 'sha256-test',
        resolvedPath: './test', source: 'marketplace', primaryKind: 'plugin',
      provides: ['plugin'],
        signature: {
          algorithm: 'ed25519',
          value: 'base64sig',
          signer: 'kb-labs-platform',
          signedAt: '2026-01-01T00:00:00Z',
          verifiedChecks: ['integrity', 'types'],
        },
      });

      expect(entry.signature).toBeDefined();
      expect(entry.signature!.signer).toBe('kb-labs-platform');
      expect(entry.signature!.verifiedChecks).toContain('integrity');
    });
  });
});
