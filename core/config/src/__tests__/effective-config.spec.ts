import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadEffectiveConfig } from '../api/effective-config';

// ─── Filesystem helpers ─────────────────────────────────────────────────

async function makeTmpDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'kb-effective-config-'));
}

async function writeConfigAt(root: string, filename: string, contents: string) {
  const dir = path.dirname(path.join(root, filename));
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(root, filename), contents, 'utf8');
}

async function writeProjectConfig(
  root: string,
  contents: string,
  filename = '.kb/kb.config.json',
) {
  await writeConfigAt(root, filename, contents);
}

async function writePlatformConfig(
  root: string,
  contents: string,
  filename = '.kb/kb.config.json',
) {
  await writeConfigAt(root, filename, contents);
}

async function writeOverlay(root: string, name: string, contents: string) {
  const dir = path.join(root, '.kb', 'overlays');
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, name), contents, 'utf8');
}

// Shared tmpdir lifecycle for every describe — each test starts clean.
function makeFixture() {
  const ctx: { tmp: string; project: string; platform: string } = {
    tmp: '',
    project: '',
    platform: '',
  };
  beforeEach(async () => {
    ctx.tmp = await makeTmpDir();
    ctx.project = path.join(ctx.tmp, 'project');
    ctx.platform = path.join(ctx.tmp, 'platform');
  });
  afterEach(async () => {
    await fsp.rm(ctx.tmp, { recursive: true, force: true });
  });
  return ctx;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('loadEffectiveConfig — layer presence matrix', () => {
  const c = makeFixture();

  it('returns null when no layer contributes', async () => {
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res).toBeNull();
  });

  it('platform-only (project missing, no overlays)', async () => {
    await writePlatformConfig(c.platform, '{"gateway":{"port":4000}}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res).not.toBeNull();
    expect(res!.data).toEqual({ gateway: { port: 4000 } });
    expect(res!.platformConfigPath).toBe(path.join(c.platform, '.kb', 'kb.config.json'));
    expect(res!.projectConfigPath).toBeUndefined();
    expect(res!.overlayPaths).toEqual([]);
  });

  it('project-only (no platformRoot)', async () => {
    await writeProjectConfig(c.project, '{"gateway":{"port":4000}}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data).toEqual({ gateway: { port: 4000 } });
    expect(res!.platformConfigPath).toBeUndefined();
    expect(res!.projectConfigPath).toBeDefined();
  });

  it('overlays-only (no platform, no project)', async () => {
    await writeOverlay(c.project, 'p.jsonc', '{"gateway":{"port":5000}}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res).not.toBeNull();
    expect(res!.data).toEqual({ gateway: { port: 5000 } });
    expect(res!.platformConfigPath).toBeUndefined();
    expect(res!.projectConfigPath).toBeUndefined();
    expect(res!.overlayPaths).toHaveLength(1);
  });

  it('platform + project (project overrides platform)', async () => {
    await writePlatformConfig(c.platform, '{"gateway":{"port":4000,"host":"0.0.0.0"}}');
    await writeProjectConfig(c.project, '{"gateway":{"port":5000}}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data).toEqual({ gateway: { port: 5000, host: '0.0.0.0' } });
  });

  it('platform + overlays (no project file)', async () => {
    await writePlatformConfig(c.platform, '{"gateway":{"port":4000}}');
    await writeOverlay(c.project, 'p.jsonc', '{"gateway":{"pressure":{"enabled":true}}}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data).toEqual({
      gateway: { port: 4000, pressure: { enabled: true } },
    });
  });

  it('project + overlays (no platformRoot)', async () => {
    await writeProjectConfig(c.project, '{"gateway":{"port":4000}}');
    await writeOverlay(c.project, 'p.jsonc', '{"gateway":{"port":5000}}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data).toEqual({ gateway: { port: 5000 } });
  });

  it('all three layers merged in order', async () => {
    await writePlatformConfig(c.platform, '{"a":1,"b":1,"c":1}');
    await writeProjectConfig(c.project, '{"b":2,"c":2}');
    await writeOverlay(c.project, 'p.jsonc', '{"c":3}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data).toEqual({ a: 1, b: 2, c: 3 });
  });
});

describe('loadEffectiveConfig — layer ordering', () => {
  const c = makeFixture();

  it('overlays win over project layer', async () => {
    await writeProjectConfig(c.project, '{"value":"project"}');
    await writeOverlay(c.project, 'p.jsonc', '{"value":"overlay"}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.value).toBe('overlay');
  });

  it('project wins over platform layer', async () => {
    await writePlatformConfig(c.platform, '{"value":"platform"}');
    await writeProjectConfig(c.project, '{"value":"project"}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data.value).toBe('project');
  });

  it('overlays win over platform even without a project layer', async () => {
    await writePlatformConfig(c.platform, '{"value":"platform"}');
    await writeOverlay(c.project, 'p.jsonc', '{"value":"overlay"}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data.value).toBe('overlay');
  });

  it('later overlay (by lex order) wins over earlier overlay', async () => {
    await writeProjectConfig(c.project, '{"value":"project"}');
    await writeOverlay(c.project, 'a-first.jsonc', '{"value":"first"}');
    await writeOverlay(c.project, 'z-last.jsonc', '{"value":"last"}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.value).toBe('last');
  });

  it('overlayPaths reflects lex application order', async () => {
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(c.project, 'b.jsonc', '{}');
    await writeOverlay(c.project, 'a.jsonc', '{}');
    await writeOverlay(c.project, 'c.jsonc', '{}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.overlayPaths.map((p) => path.basename(p))).toEqual([
      'a.jsonc',
      'b.jsonc',
      'c.jsonc',
    ]);
  });

  it('numeric prefixes sort lexically (not numerically)', async () => {
    // Documenting current behaviour: lex order means "10" comes BEFORE "2".
    // If callers want numeric order they have to zero-pad ("02", "10").
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(c.project, '2.jsonc', '{}');
    await writeOverlay(c.project, '10.jsonc', '{}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.overlayPaths.map((p) => path.basename(p))).toEqual([
      '10.jsonc',
      '2.jsonc',
    ]);
  });
});

describe('loadEffectiveConfig — deep-merge semantics', () => {
  const c = makeFixture();

  it('nested objects merge recursively', async () => {
    await writeProjectConfig(
      c.project,
      '{"a":{"b":{"c":1,"d":2},"e":3}}',
    );
    await writeOverlay(c.project, 'p.jsonc', '{"a":{"b":{"c":99}}}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data).toEqual({ a: { b: { c: 99, d: 2 }, e: 3 } });
  });

  it('introduced keys are added (no shadowing siblings)', async () => {
    await writeProjectConfig(c.project, '{"existing":1}');
    await writeOverlay(c.project, 'p.jsonc', '{"new":2}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data).toEqual({ existing: 1, new: 2 });
  });

  it('overlay arrays REPLACE base arrays by default', async () => {
    await writeProjectConfig(c.project, '{"items":[1,2,3]}');
    await writeOverlay(c.project, 'p.jsonc', '{"items":[4]}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.items).toEqual([4]);
  });

  it('kb:merge:append concatenates arrays', async () => {
    await writeProjectConfig(c.project, '{"adapters":{"llm":["openai"]}}');
    await writeOverlay(
      c.project,
      'p.jsonc',
      '{"adapters":{"kb:merge":{"llm":"append"},"llm":["vibeproxy"]}}',
    );
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data).toEqual({ adapters: { llm: ['openai', 'vibeproxy'] } });
  });

  it('kb:merge directive key is stripped from the result', async () => {
    await writeProjectConfig(c.project, '{"adapters":{"llm":["openai"]}}');
    await writeOverlay(
      c.project,
      'p.jsonc',
      '{"adapters":{"kb:merge":{"llm":"append"},"llm":["x"]}}',
    );
    const res = await loadEffectiveConfig(c.project);
    expect((res!.data.adapters as Record<string, unknown>)['kb:merge']).toBeUndefined();
  });

  it('multiple overlays each append (cumulative)', async () => {
    await writeProjectConfig(c.project, '{"x":[1]}');
    await writeOverlay(
      c.project,
      'a.jsonc',
      '{"kb:merge":{"x":"append"},"x":[2]}',
    );
    await writeOverlay(
      c.project,
      'b.jsonc',
      '{"kb:merge":{"x":"append"},"x":[3]}',
    );
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.x).toEqual([1, 2, 3]);
  });

  it('type mismatch: overlay value wins (object → scalar)', async () => {
    await writeProjectConfig(c.project, '{"v":{"nested":true}}');
    await writeOverlay(c.project, 'p.jsonc', '{"v":"plain-string"}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.v).toBe('plain-string');
  });

  it('type mismatch: overlay value wins (scalar → object)', async () => {
    await writeProjectConfig(c.project, '{"v":42}');
    await writeOverlay(c.project, 'p.jsonc', '{"v":{"now":"object"}}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.v).toEqual({ now: 'object' });
  });

  it('null in overlay overrides defined value', async () => {
    await writeProjectConfig(c.project, '{"v":"defined"}');
    await writeOverlay(c.project, 'p.jsonc', '{"v":null}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.v).toBeNull();
  });

  it('empty overlay object is a no-op', async () => {
    await writeProjectConfig(c.project, '{"v":1}');
    await writeOverlay(c.project, 'p.jsonc', '{}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data).toEqual({ v: 1 });
  });
});

describe('loadEffectiveConfig — file format precedence', () => {
  const c = makeFixture();

  it('prefers .kb/kb.config.jsonc over .kb/kb.config.json', async () => {
    await writeProjectConfig(c.project, '{"src":"jsonc"}', '.kb/kb.config.jsonc');
    await writeProjectConfig(c.project, '{"src":"json"}', '.kb/kb.config.json');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.src).toBe('jsonc');
    expect(res!.projectConfigPath).toMatch(/kb\.config\.jsonc$/);
  });

  it('falls through to root-level kb.config.jsonc when .kb/ absent', async () => {
    await writeProjectConfig(c.project, '{"src":"root"}', 'kb.config.jsonc');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.src).toBe('root');
    expect(res!.projectConfigPath).toMatch(/[/\\]kb\.config\.jsonc$/);
  });

  it('parses JSONC with line comments and trailing commas', async () => {
    await writeProjectConfig(
      c.project,
      `{
        // line comment
        "gateway": {
          "port": 4000, /* inline */
        },
      }`,
      '.kb/kb.config.jsonc',
    );
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data).toEqual({ gateway: { port: 4000 } });
    expect(res!.diagnostics).toEqual([]);
  });

  it('parses JSONC overlays with comments', async () => {
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(
      c.project,
      'p.jsonc',
      `{
        // pressure overlay
        "gateway": { "pressure": { "enabled": true } } // <- trailing
      }`,
    );
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data).toEqual({ gateway: { pressure: { enabled: true } } });
  });
});

describe('loadEffectiveConfig — diagnostics', () => {
  const c = makeFixture();

  it('reports JSON_PARSE_FAILED for malformed project config', async () => {
    await writeProjectConfig(c.project, '{ not json');
    const res = await loadEffectiveConfig(c.project);
    expect(res).not.toBeNull();
    expect(res!.diagnostics.some((d) => d.code === 'JSON_PARSE_FAILED')).toBe(true);
    expect(res!.data).toEqual({});
  });

  it('reports CONFIG_NOT_OBJECT when project top-level is an array', async () => {
    await writeProjectConfig(c.project, '[1,2,3]');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.diagnostics.some((d) => d.code === 'CONFIG_NOT_OBJECT')).toBe(true);
    expect(res!.data).toEqual({});
  });

  it('reports CONFIG_NOT_OBJECT when platform top-level is an array', async () => {
    await writePlatformConfig(c.platform, '[1,2,3]');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.diagnostics.some((d) => d.code === 'CONFIG_NOT_OBJECT')).toBe(true);
  });

  it('reports OVERLAY_NOT_OBJECT for non-object overlay', async () => {
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(c.project, 'bad.jsonc', '[1,2,3]');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.diagnostics.some((d) => d.code === 'OVERLAY_NOT_OBJECT')).toBe(true);
    // Bad overlay must not poison the result.
    expect(res!.data).toEqual({});
  });

  it('skips malformed overlay but applies the rest', async () => {
    await writeProjectConfig(c.project, '{"v":0}');
    await writeOverlay(c.project, 'a.jsonc', '{"v":1}');
    await writeOverlay(c.project, 'b.jsonc', '{ broken');
    await writeOverlay(c.project, 'c.jsonc', '{"v":3}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.diagnostics.some((d) => d.code === 'JSON_PARSE_FAILED')).toBe(true);
    expect(res!.data.v).toBe(3); // c.jsonc still applied after b.jsonc was skipped
  });

  it('emits no diagnostics on the happy path', async () => {
    await writePlatformConfig(c.platform, '{"a":1}');
    await writeProjectConfig(c.project, '{"b":2}');
    await writeOverlay(c.project, 'p.jsonc', '{"c":3}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.diagnostics).toEqual([]);
  });

  it('aggregates diagnostics across multiple layers', async () => {
    await writePlatformConfig(c.platform, '{ bad platform');
    await writeProjectConfig(c.project, '[1,2]'); // array — CONFIG_NOT_OBJECT
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    const codes = res!.diagnostics.map((d) => d.code);
    expect(codes).toContain('JSON_PARSE_FAILED');
    expect(codes).toContain('CONFIG_NOT_OBJECT');
  });

  it('empty overlay file is reported as JSON_PARSE_FAILED, not silent', async () => {
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(c.project, 'empty.jsonc', '');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.diagnostics.some((d) => d.code === 'JSON_PARSE_FAILED')).toBe(true);
  });
});

describe('loadEffectiveConfig — path resolution & result fields', () => {
  const c = makeFixture();

  it('returns absolute paths in all path fields', async () => {
    await writePlatformConfig(c.platform, '{}');
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(c.project, 'p.jsonc', '{}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(path.isAbsolute(res!.platformConfigPath!)).toBe(true);
    expect(path.isAbsolute(res!.projectConfigPath!)).toBe(true);
    expect(res!.overlayPaths.every((p) => path.isAbsolute(p))).toBe(true);
  });

  it('ignores platformRoot when it equals projectRoot (no double-merge)', async () => {
    await writeProjectConfig(c.project, '{"v":1}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.project });
    expect(res!.data).toEqual({ v: 1 });
    expect(res!.platformConfigPath).toBeUndefined();
  });

  it('treats undefined platformRoot as no platform layer', async () => {
    await writePlatformConfig(c.platform, '{"v":"platform"}');
    await writeProjectConfig(c.project, '{}');
    const res = await loadEffectiveConfig(c.project); // no opts
    expect(res!.data).toEqual({});
    expect(res!.platformConfigPath).toBeUndefined();
  });

  it('platformConfigPath unset when platform root has no kb.config.*', async () => {
    await writeProjectConfig(c.project, '{}');
    // platform dir exists but is empty
    await fsp.mkdir(c.platform, { recursive: true });
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.platformConfigPath).toBeUndefined();
  });

  it('projectConfigPath unset when project has only overlays', async () => {
    await writeOverlay(c.project, 'p.jsonc', '{}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.projectConfigPath).toBeUndefined();
    expect(res!.overlayPaths).toHaveLength(1);
  });

  it('result is null only when literally nothing exists', async () => {
    // Neither dir created.
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res).toBeNull();
  });
});

describe('loadEffectiveConfig — overlay isolation', () => {
  const c = makeFixture();

  it('overlays placed under platformRoot are NOT loaded', async () => {
    await writePlatformConfig(c.platform, '{"v":"platform"}');
    // Plant a fake "overlay" under the platform root — must be ignored.
    await fsp.mkdir(path.join(c.platform, '.kb', 'overlays'), { recursive: true });
    await fsp.writeFile(
      path.join(c.platform, '.kb', 'overlays', 'rogue.jsonc'),
      '{"v":"rogue"}',
    );
    await writeProjectConfig(c.project, '{}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data.v).toBe('platform');
    expect(res!.overlayPaths).toEqual([]);
  });

  it('non-.jsonc files in overlays/ are ignored', async () => {
    await writeProjectConfig(c.project, '{"v":"project"}');
    const overlayDir = path.join(c.project, '.kb', 'overlays');
    await fsp.mkdir(overlayDir, { recursive: true });
    await fsp.writeFile(path.join(overlayDir, 'README.md'), '# docs');
    await fsp.writeFile(path.join(overlayDir, 'skip.json'), '{"v":"json"}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.v).toBe('project');
    expect(res!.overlayPaths).toEqual([]);
  });

  it('overlays in a subdirectory of .kb/overlays/ are NOT loaded', async () => {
    await writeProjectConfig(c.project, '{"v":"project"}');
    const nested = path.join(c.project, '.kb', 'overlays', 'nested');
    await fsp.mkdir(nested, { recursive: true });
    await fsp.writeFile(path.join(nested, 'a.jsonc'), '{"v":"nested"}');
    const res = await loadEffectiveConfig(c.project);
    expect(res!.data.v).toBe('project');
    expect(res!.overlayPaths).toEqual([]);
  });
});

describe('loadEffectiveConfig — realistic scenarios', () => {
  const c = makeFixture();

  it('gateway pressure: overlay adds pressure section to full platform baseline', async () => {
    // Mimics the CI shape: platform has full gateway block; project layer
    // has nothing gateway-related; scenario overlay only carries the
    // pressure delta. Result must include both.
    await writePlatformConfig(
      c.platform,
      JSON.stringify({
        gateway: {
          port: 4000,
          upstreams: { rest: { url: 'http://rest:5050' } },
          staticTokens: { 'dev-token': { hostId: 'studio', namespaceId: 'default' } },
        },
      }),
    );
    await writeProjectConfig(c.project, '{"platform":{"dir":"/root/kb-platform"}}');
    await writeOverlay(
      c.project,
      'gateway-pressure__overlay.jsonc',
      JSON.stringify({
        gateway: {
          pressure: {
            enabled: true,
            perService: { rest: { requestsPerSecond: 5 } },
          },
        },
      }),
    );

    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data).toEqual({
      platform: { dir: '/root/kb-platform' },
      gateway: {
        port: 4000,
        upstreams: { rest: { url: 'http://rest:5050' } },
        staticTokens: { 'dev-token': { hostId: 'studio', namespaceId: 'default' } },
        pressure: {
          enabled: true,
          perService: { rest: { requestsPerSecond: 5 } },
        },
      },
    });
  });

  it('overlay disables a baseline-enabled feature', async () => {
    await writePlatformConfig(c.platform, '{"feature":{"enabled":true,"opts":{"x":1}}}');
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(c.project, 'kill.jsonc', '{"feature":{"enabled":false}}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data).toEqual({
      feature: { enabled: false, opts: { x: 1 } }, // opts preserved from baseline
    });
  });

  it('overlay extends an adapter list via kb:merge:append', async () => {
    await writePlatformConfig(
      c.platform,
      '{"platform":{"adapters":{"llm":["@kb-labs/adapters-openai"]}}}',
    );
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(
      c.project,
      'multi-llm.jsonc',
      `{"platform":{"adapters":{"kb:merge":{"llm":"append"},"llm":["@kb-labs/adapters-vibeproxy"]}}}`,
    );
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(
      ((res!.data.platform as { adapters: { llm: string[] } }).adapters.llm),
    ).toEqual([
      '@kb-labs/adapters-openai',
      '@kb-labs/adapters-vibeproxy',
    ]);
  });

  it('two overlays cooperate (one tweaks baseline, another adds new field)', async () => {
    await writePlatformConfig(c.platform, '{"a":1,"b":2}');
    await writeProjectConfig(c.project, '{}');
    await writeOverlay(c.project, 'a__bump.jsonc', '{"a":10}');
    await writeOverlay(c.project, 'b__add.jsonc', '{"c":3}');
    const res = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(res!.data).toEqual({ a: 10, b: 2, c: 3 });
  });
});

describe('loadEffectiveConfig — idempotency & side effects', () => {
  const c = makeFixture();

  it('two consecutive loads return equal data without mutating disk', async () => {
    await writePlatformConfig(c.platform, '{"v":1}');
    await writeProjectConfig(c.project, '{"v":2}');
    await writeOverlay(c.project, 'p.jsonc', '{"v":3}');

    const first = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    const second = await loadEffectiveConfig(c.project, { platformRoot: c.platform });
    expect(first!.data).toEqual(second!.data);
    expect(first!.overlayPaths).toEqual(second!.overlayPaths);
  });

  it('mutating the returned data does not affect subsequent calls', async () => {
    await writeProjectConfig(c.project, '{"nested":{"v":1}}');
    const first = await loadEffectiveConfig(c.project);
    (first!.data.nested as { v: number }).v = 999;
    const second = await loadEffectiveConfig(c.project);
    expect((second!.data.nested as { v: number }).v).toBe(1);
  });
});
