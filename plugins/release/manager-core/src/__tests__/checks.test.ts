import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { runReleaseChecks } from '../checks';
import type { CustomCheckConfig } from '../types';

// ─── helper scripts ───────────────────────────────────────────────────────────

let scriptsDir: string;

beforeAll(() => {
  scriptsDir = join(tmpdir(), `checks-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(scriptsDir, { recursive: true });
  writeFileSync(join(scriptsDir, 'ok-json.js'), `process.stdout.write(JSON.stringify({ok:true}))`);
  writeFileSync(join(scriptsDir, 'success-json.js'), `process.stdout.write(JSON.stringify({success:true}))`);
  writeFileSync(join(scriptsDir, 'status-json.js'), `process.stdout.write(JSON.stringify({status:"ok"}))`);
  writeFileSync(join(scriptsDir, 'fail-json.js'), `process.stdout.write(JSON.stringify({ok:false}))`);
  writeFileSync(join(scriptsDir, 'not-json.js'), `process.stdout.write("not json")`);
  writeFileSync(join(scriptsDir, 'hello.js'), `process.stdout.write("hello world")`);
  writeFileSync(join(scriptsDir, 'test-output.js'), `process.stdout.write("test-output")`);
});

afterAll(() => {
  rmSync(scriptsDir, { recursive: true, force: true });
});

// ─── parser: exitcode (default) ──────────────────────────────────────────────

describe('runReleaseChecks — parser: exitcode', () => {
  it('passes when command exits 0', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'ok', command: 'true', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results[0]?.ok).toBe(true);
  });

  it('fails when command exits non-zero', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'fail', command: 'false', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results[0]?.ok).toBe(false);
  });
});

// ─── parser: json ─────────────────────────────────────────────────────────────

describe('runReleaseChecks — parser: json', () => {
  it('passes when stdout contains { ok: true }', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'json-ok', command: `node ${join(scriptsDir, 'ok-json.js')}`, parser: 'json', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results[0]?.ok).toBe(true);
  });

  it('passes when stdout contains { success: true }', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'json-success', command: `node ${join(scriptsDir, 'success-json.js')}`, parser: 'json', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results[0]?.ok).toBe(true);
  });

  it('passes when stdout contains { status: "ok" }', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'json-status', command: `node ${join(scriptsDir, 'status-json.js')}`, parser: 'json', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results[0]?.ok).toBe(true);
  });

  it('fails when json reports { ok: false }', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'json-fail', command: `node ${join(scriptsDir, 'fail-json.js')}`, parser: 'json', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results[0]?.ok).toBe(false);
  });

  it('fails when stdout is not valid JSON', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'json-invalid', command: `node ${join(scriptsDir, 'not-json.js')}`, parser: 'json', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results[0]?.ok).toBe(false);
  });
});

// ─── parser: function ─────────────────────────────────────────────────────────

describe('runReleaseChecks — parser: function', () => {
  it('uses custom parser function', async () => {
    const checks: CustomCheckConfig[] = [
      {
        id: 'custom',
        command: `node ${join(scriptsDir, 'hello.js')}`,
        parser: (stdout) => stdout.includes('hello'),
        runIn: 'repoRoot',
      },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results[0]?.ok).toBe(true);
  });

  it('custom parser receives stdout, stderr, exitCode', async () => {
    let captured: { stdout: string; stderr: string; exitCode: number } | undefined;
    const checks: CustomCheckConfig[] = [
      {
        id: 'capture',
        command: `node ${join(scriptsDir, 'test-output.js')}`,
        parser: (stdout, stderr, exitCode) => {
          captured = { stdout, stderr, exitCode };
          return true;
        },
        runIn: 'repoRoot',
      },
    ];
    await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(captured?.stdout).toBe('test-output');
    expect(captured?.exitCode).toBe(0);
  });
});

// ─── optional checks ──────────────────────────────────────────────────────────

describe('runReleaseChecks — optional', () => {
  it('continues after optional failure', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'optional-fail', command: 'false', optional: true, runIn: 'repoRoot' },
      { id: 'after', command: 'true', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(false);
    expect(results[1]?.ok).toBe(true);
  });

  it('stops after required failure', async () => {
    const checks: CustomCheckConfig[] = [
      { id: 'required-fail', command: 'false', runIn: 'repoRoot' },
      { id: 'never-runs', command: 'true', runIn: 'repoRoot' },
    ];
    const results = await runReleaseChecks(checks, { repoRoot: '/tmp', packagePaths: [] });
    expect(results).toHaveLength(1);
  });
});
