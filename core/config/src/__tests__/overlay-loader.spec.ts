import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadOverlays } from '../overlay/loader';

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'kb-overlay-'));
}

async function writeOverlay(root: string, name: string, contents: string) {
  const dir = path.join(root, '.kb', 'overlays');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), contents, 'utf8');
}

describe('loadOverlays', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await makeTmpDir();
  });

  afterEach(async () => {
    await fsp.rm(tmp, { recursive: true, force: true });
  });

  it('returns empty when .kb/overlays does not exist', async () => {
    const res = await loadOverlays(tmp);
    expect(res.overlays).toEqual([]);
    expect(res.diagnostics).toEqual([]);
  });

  it('reads .jsonc files in lexicographic order', async () => {
    await writeOverlay(tmp, 'b.jsonc', '{ "x": 2 }');
    await writeOverlay(tmp, 'a.jsonc', '{ "x": 1 }');
    await writeOverlay(tmp, 'c.jsonc', '{ "x": 3 }');

    const res = await loadOverlays(tmp);
    expect(res.overlays.map((o) => o.name)).toEqual(['a.jsonc', 'b.jsonc', 'c.jsonc']);
    expect(res.overlays.map((o) => o.data)).toEqual([{ x: 1 }, { x: 2 }, { x: 3 }]);
  });

  it('supports JSONC comments and trailing commas', async () => {
    await writeOverlay(
      tmp,
      'p.jsonc',
      `{
        // top-level comment
        "adapters": {
          "llm": "openai", /* inline */
        },
      }`,
    );
    const res = await loadOverlays(tmp);
    expect(res.diagnostics).toEqual([]);
    expect(res.overlays).toHaveLength(1);
    expect(res.overlays[0].data).toEqual({ adapters: { llm: 'openai' } });
  });

  it('ignores non-.jsonc files', async () => {
    await writeOverlay(tmp, 'keep.jsonc', '{ "x": 1 }');
    const overlayDir = path.join(tmp, '.kb', 'overlays');
    await fsp.writeFile(path.join(overlayDir, 'README.md'), 'docs');
    await fsp.writeFile(path.join(overlayDir, 'skip.json'), '{"x":2}');

    const res = await loadOverlays(tmp);
    expect(res.overlays.map((o) => o.name)).toEqual(['keep.jsonc']);
  });

  it('emits diagnostic on malformed jsonc and continues', async () => {
    await writeOverlay(tmp, 'a.jsonc', '{ "x": 1 }');
    await writeOverlay(tmp, 'b.jsonc', '{ broken');
    await writeOverlay(tmp, 'c.jsonc', '{ "x": 3 }');

    const res = await loadOverlays(tmp);
    expect(res.overlays.map((o) => o.name)).toEqual(['a.jsonc', 'c.jsonc']);
    expect(res.diagnostics.some((d) => d.code === 'JSON_PARSE_FAILED')).toBe(true);
  });

  it('rejects overlay whose top-level is not an object', async () => {
    await writeOverlay(tmp, 'arr.jsonc', '[1, 2, 3]');
    const res = await loadOverlays(tmp);
    expect(res.overlays).toEqual([]);
    expect(res.diagnostics.some((d) => d.code === 'OVERLAY_NOT_OBJECT')).toBe(true);
  });
});
