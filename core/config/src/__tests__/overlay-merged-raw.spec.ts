import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readMergedRawConfig } from '../overlay/merged-raw';

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'kb-merged-raw-'));
}

async function writeProjectConfig(root: string, contents: string) {
  const dir = path.join(root, '.kb');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'kb.config.json'), contents, 'utf8');
}

async function writeOverlay(root: string, name: string, contents: string) {
  const dir = path.join(root, '.kb', 'overlays');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), contents, 'utf8');
}

describe('readMergedRawConfig', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmpDir();
  });

  afterEach(async () => {
    await fsp.rm(tmp, { recursive: true, force: true });
  });

  it('returns null when neither project config nor overlays exist', async () => {
    const res = await readMergedRawConfig(tmp);
    expect(res).toBeNull();
  });

  it('returns project config unchanged when no overlays exist', async () => {
    await writeProjectConfig(tmp, '{"gateway":{"port":4000}}');
    const res = await readMergedRawConfig(tmp);
    expect(res).not.toBeNull();
    expect(res!.data).toEqual({ gateway: { port: 4000 } });
    expect(res!.overlayPaths).toEqual([]);
    expect(res!.projectConfigPath).toBe(path.join(tmp, '.kb', 'kb.config.json'));
  });

  it('applies overlays on top of project config (deep merge)', async () => {
    await writeProjectConfig(
      tmp,
      '{"gateway":{"port":4000,"pressure":{"safetyMargin":2}}}',
    );
    await writeOverlay(
      tmp,
      'pressure.jsonc',
      '{"gateway":{"pressure":{"safetyMargin":1,"perService":{"rest":5}}}}',
    );
    const res = await readMergedRawConfig(tmp);
    expect(res!.data).toEqual({
      gateway: {
        port: 4000,
        pressure: {
          safetyMargin: 1, // overlay wins
          perService: { rest: 5 }, // added by overlay
        },
      },
    });
    expect(res!.overlayPaths).toHaveLength(1);
  });

  it('honours kb:merge:append directive for arrays', async () => {
    await writeProjectConfig(tmp, '{"adapters":{"llm":["openai"]}}');
    await writeOverlay(
      tmp,
      'multi.jsonc',
      `{"adapters":{"kb:merge":{"llm":"append"},"llm":["vibeproxy"]}}`,
    );
    const res = await readMergedRawConfig(tmp);
    expect(res!.data).toEqual({ adapters: { llm: ['openai', 'vibeproxy'] } });
  });

  it('returns overlay-only result when project config is absent', async () => {
    await writeOverlay(tmp, 'p.jsonc', '{"gateway":{"port":5000}}');
    const res = await readMergedRawConfig(tmp);
    expect(res).not.toBeNull();
    expect(res!.data).toEqual({ gateway: { port: 5000 } });
    expect(res!.projectConfigPath).toBeUndefined();
  });

  it('reports diagnostic when project config is not an object', async () => {
    await writeProjectConfig(tmp, '[1,2,3]');
    const res = await readMergedRawConfig(tmp);
    expect(res).not.toBeNull();
    expect(res!.diagnostics.some(d => d.code === 'CONFIG_NOT_OBJECT')).toBe(true);
    expect(res!.data).toEqual({});
  });
});
