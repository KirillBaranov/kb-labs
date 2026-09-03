import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { explainBundle, clearCaches } from '../index';

async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) { await copyDir(srcPath, destPath); }
    else { await fsp.copyFile(srcPath, destPath); }
  }
}

describe('explainBundle', () => {
  let testDir: string;
  const fixtureDir = path.join(__dirname, '../__fixtures__/workspace');

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `kb-labs-explain-${Date.now()}`);
    await fsp.mkdir(testDir, { recursive: true });
    await copyDir(fixtureDir, testDir);
    clearCaches();
  });

  afterEach(async () => {
    await fsp.rm(testDir, { recursive: true, force: true });
    clearCaches();
  });

  it('returns merge trace array', async () => {
    const trace = await explainBundle({ cwd: testDir, product: 'review', profileId: 'default' });
    expect(Array.isArray(trace)).toBe(true);
    expect(trace.length).toBeGreaterThan(0);
  });

  it('each trace entry has source and path fields', async () => {
    const trace = await explainBundle({ cwd: testDir, product: 'review', profileId: 'default' });
    for (const entry of trace) {
      expect(entry).toHaveProperty('source');
      expect(entry).toHaveProperty('path');
    }
  });
});
