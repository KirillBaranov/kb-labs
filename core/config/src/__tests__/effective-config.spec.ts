import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadEffectiveConfig } from '../api/effective-config';

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'kb-effective-config-'));
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

describe('loadEffectiveConfig', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmpDir();
  });

  afterEach(async () => {
    await fsp.rm(tmp, { recursive: true, force: true });
  });

  it('returns null when neither project config nor overlays exist', async () => {
    const res = await loadEffectiveConfig(tmp);
    expect(res).toBeNull();
  });

  it('returns project config unchanged when no overlays exist', async () => {
    await writeProjectConfig(tmp, '{"gateway":{"port":4000}}');
    const res = await loadEffectiveConfig(tmp);
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
    const res = await loadEffectiveConfig(tmp);
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
    const res = await loadEffectiveConfig(tmp);
    expect(res!.data).toEqual({ adapters: { llm: ['openai', 'vibeproxy'] } });
  });

  it('returns overlay-only result when project config is absent', async () => {
    await writeOverlay(tmp, 'p.jsonc', '{"gateway":{"port":5000}}');
    const res = await loadEffectiveConfig(tmp);
    expect(res).not.toBeNull();
    expect(res!.data).toEqual({ gateway: { port: 5000 } });
    expect(res!.projectConfigPath).toBeUndefined();
  });

  it('reports diagnostic when project config is not an object', async () => {
    await writeProjectConfig(tmp, '[1,2,3]');
    const res = await loadEffectiveConfig(tmp);
    expect(res).not.toBeNull();
    expect(res!.diagnostics.some(d => d.code === 'CONFIG_NOT_OBJECT')).toBe(true);
    expect(res!.data).toEqual({});
  });

  it('deep-merges platform → project → overlays when platformRoot is provided', async () => {
    const projectRoot = path.join(tmp, 'project');
    const platformRoot = path.join(tmp, 'platform');
    await fsp.mkdir(path.join(platformRoot, '.kb'), { recursive: true });
    await fsp.writeFile(
      path.join(platformRoot, '.kb', 'kb.config.json'),
      JSON.stringify({
        gateway: { port: 4000, upstreams: { rest: { url: 'http://rest' } } },
      }),
    );
    await writeProjectConfig(
      projectRoot,
      JSON.stringify({ gateway: { staticTokens: { 'dev-token': { hostId: 'x' } } } }),
    );
    await writeOverlay(
      projectRoot,
      'pressure.jsonc',
      JSON.stringify({ gateway: { pressure: { enabled: true } } }),
    );

    const res = await loadEffectiveConfig(projectRoot, { platformRoot });
    expect(res).not.toBeNull();
    expect(res!.data).toEqual({
      gateway: {
        port: 4000,
        upstreams: { rest: { url: 'http://rest' } },
        staticTokens: { 'dev-token': { hostId: 'x' } },
        pressure: { enabled: true },
      },
    });
    expect(res!.platformConfigPath).toBe(path.join(platformRoot, '.kb', 'kb.config.json'));
    expect(res!.projectConfigPath).toBe(path.join(projectRoot, '.kb', 'kb.config.json'));
    expect(res!.overlayPaths).toHaveLength(1);
  });

  it('ignores platformRoot when it equals projectRoot (no double-merge)', async () => {
    await writeProjectConfig(tmp, '{"gateway":{"port":4000}}');
    const res = await loadEffectiveConfig(tmp, { platformRoot: tmp });
    expect(res!.data).toEqual({ gateway: { port: 4000 } });
    expect(res!.platformConfigPath).toBeUndefined();
    expect(res!.projectConfigPath).toBe(path.join(tmp, '.kb', 'kb.config.json'));
  });

  it('overlays only ever come from projectRoot, not platformRoot', async () => {
    const projectRoot = path.join(tmp, 'project');
    const platformRoot = path.join(tmp, 'platform');
    await fsp.mkdir(path.join(platformRoot, '.kb', 'overlays'), { recursive: true });
    await fsp.writeFile(
      path.join(platformRoot, '.kb', 'overlays', 'leak.jsonc'),
      '{"gateway":{"port":9999}}',
    );
    await writeProjectConfig(projectRoot, '{"gateway":{"port":4000}}');

    const res = await loadEffectiveConfig(projectRoot, { platformRoot });
    expect(res!.data).toEqual({ gateway: { port: 4000 } });
    expect(res!.overlayPaths).toEqual([]);
  });
});
