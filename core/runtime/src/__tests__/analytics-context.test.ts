import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAnalyticsContext } from '../analytics-context.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  }
}

// Clear all CI env vars before each test so tests don't inherit CI env
const CI_ENV_VARS = [
  'CI', 'GITHUB_ACTIONS', 'GITLAB_CI', 'CIRCLECI', 'TRAVIS',
  'JENKINS_URL', 'GITHUB_ACTOR', 'GITLAB_USER_LOGIN', 'CIRCLE_USERNAME',
  'BUILD_USER_ID', 'GITLAB_USER_NAME', 'BUILD_USER',
];

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'analytics-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── detectSource ──────────────────────────────────────────────────────────────

describe('detectSource (via createAnalyticsContext)', () => {
  it('reads product name and version from package.json', async () => {
    await writeFile(
      join(tmpDir, 'package.json'),
      JSON.stringify({ name: '@my/tool', version: '2.3.4' })
    );

    withEnv(Object.fromEntries(CI_ENV_VARS.map(k => [k, undefined])), () => {});

    // Clear CI so detectActor doesn't fail
    const ctx = await createAnalyticsContext(tmpDir);
    expect(ctx.source.product).toBe('@my/tool');
    expect(ctx.source.version).toBe('2.3.4');
  });

  it('falls back to defaults when package.json is missing', async () => {
    const ctx = await createAnalyticsContext(tmpDir); // no package.json
    expect(ctx.source.product).toBe('kb-labs');
    expect(ctx.source.version).toBe('0.0.0');
  });

  it('falls back to defaults for malformed package.json', async () => {
    await writeFile(join(tmpDir, 'package.json'), 'not json {{{');
    const ctx = await createAnalyticsContext(tmpDir);
    expect(ctx.source.product).toBe('kb-labs');
    expect(ctx.source.version).toBe('0.0.0');
  });

  it('handles package.json with missing name/version fields', async () => {
    await writeFile(join(tmpDir, 'package.json'), JSON.stringify({ description: 'no name' }));
    const ctx = await createAnalyticsContext(tmpDir);
    expect(ctx.source.product).toBe('kb-labs');
    expect(ctx.source.version).toBe('0.0.0');
  });
});

// ── detectActor ───────────────────────────────────────────────────────────────

describe('detectActor — CI environments', () => {
  it('GITHUB_ACTIONS → type: ci, reads GITHUB_ACTOR', async () => {
    const saved: Record<string, string | undefined> = {};
    for (const k of CI_ENV_VARS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_ACTOR = 'octocat';

    try {
      const ctx = await createAnalyticsContext(tmpDir);
      expect(ctx.actor!.type).toBe('ci');
      expect(ctx.actor!.id).toBe('octocat');
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) { delete process.env[k]; }
        else { process.env[k] = v; }
      }
    }
  });

  it('CI=true without specific actor → uses ci-bot fallback', async () => {
    const saved: Record<string, string | undefined> = {};
    for (const k of CI_ENV_VARS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.CI = 'true';

    try {
      const ctx = await createAnalyticsContext(tmpDir);
      expect(ctx.actor!.type).toBe('ci');
      expect(ctx.actor!.id).toBe('ci-bot');
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) { delete process.env[k]; }
        else { process.env[k] = v; }
      }
    }
  });
});

// ── runId ─────────────────────────────────────────────────────────────────────

describe('runId', () => {
  it('generates a UUID for runId', async () => {
    const ctx = await createAnalyticsContext(tmpDir);
    expect(ctx.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates unique runId on each call', async () => {
    const ctx1 = await createAnalyticsContext(tmpDir);
    const ctx2 = await createAnalyticsContext(tmpDir);
    expect(ctx1.runId).not.toBe(ctx2.runId);
  });
});

// ── buildContext ──────────────────────────────────────────────────────────────

describe('buildContext', () => {
  it('includes workspace path in ctx', async () => {
    const ctx = await createAnalyticsContext(tmpDir);
    expect(ctx.ctx!.workspace).toBe(tmpDir);
  });

  it('ctx.branch is set when running in a git repo', async () => {
    // We're in a git repo, so branch should be populated
    const ctx = await createAnalyticsContext('/Users/kirillbaranov/Desktop/kb-labs-workspace');
    expect(ctx.ctx!.branch).toBeDefined();
    expect(typeof ctx.ctx!.branch).toBe('string');
  });
});
