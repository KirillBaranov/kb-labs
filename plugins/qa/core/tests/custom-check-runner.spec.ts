import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { runCustomChecks } from '../src/runner/custom-check-runner.js';
import type { WorkspacePackage, QACheckConfig } from '@kb-labs/qa-contracts';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  const dir = join(tmpdir(), `qa-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makePackage(rootDir: string, name: string): WorkspacePackage {
  const pkgDir = join(rootDir, name.replace(/[@/]/g, '-'));
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, version: '1.0.0' }));
  return { name, dir: pkgDir, relativePath: name.replace(/[@/]/g, '-'), repo: 'test-repo' };
}

/**
 * Creates a git repo with main branch + a feature branch that has changes only in pkg-a/.
 * Returns { rootDir, packages } ready for diffOnly tests.
 */
function makeGitDiffRepo(): { rootDir: string; packages: WorkspacePackage[]; base: string } {
  const rootDir = makeTmpDir();
  const g = (cmd: string) => execSync(cmd, { cwd: rootDir, stdio: 'ignore' });

  g('git init');
  g('git config user.email "test@test.com"');
  g('git config user.name "Test"');

  // Initial commit with both packages
  mkdirSync(join(rootDir, 'pkg-a'), { recursive: true });
  mkdirSync(join(rootDir, 'pkg-b'), { recursive: true });
  writeFileSync(join(rootDir, 'pkg-a', 'index.ts'), 'export {}');
  writeFileSync(join(rootDir, 'pkg-b', 'index.ts'), 'export {}');
  g('git add .');
  g('git commit -m "initial"');

  // Second commit — only modify pkg-a
  writeFileSync(join(rootDir, 'pkg-a', 'new-file.ts'), 'export const x = 1');
  g('git add .');
  g('git commit -m "feat: change pkg-a"');

  const packages: WorkspacePackage[] = [
    { name: 'pkg-a', dir: join(rootDir, 'pkg-a'), relativePath: 'pkg-a', repo: 'test' },
    { name: 'pkg-b', dir: join(rootDir, 'pkg-b'), relativePath: 'pkg-b', repo: 'test' },
  ];

  // base = parent of current HEAD — always works regardless of branch name
  return { rootDir, packages, base: 'HEAD~1' };
}

/**
 * Like makeGitDiffRepo but adds a new file (not modified) for newFiles tests.
 */
function makeGitNewFilesRepo(): { rootDir: string; packages: WorkspacePackage[]; base: string } {
  const rootDir = makeTmpDir();
  const g = (cmd: string) => execSync(cmd, { cwd: rootDir, stdio: 'ignore' });

  g('git init');
  g('git config user.email "test@test.com"');
  g('git config user.name "Test"');

  mkdirSync(join(rootDir, 'pkg-a'), { recursive: true });
  mkdirSync(join(rootDir, 'pkg-b'), { recursive: true });
  writeFileSync(join(rootDir, 'pkg-a', 'index.ts'), 'export {}');
  writeFileSync(join(rootDir, 'pkg-b', 'index.ts'), 'export {}');
  // pkg-b has an existing file that will be modified (not new)
  writeFileSync(join(rootDir, 'pkg-b', 'existing.ts'), 'export const x = 1');
  g('git add .');
  g('git commit -m "initial"');

  // pkg-a: add a brand new file
  writeFileSync(join(rootDir, 'pkg-a', 'brand-new.ts'), 'export const y = 2');
  // pkg-b: modify existing file (not new, --diff-filter=A won't catch it)
  writeFileSync(join(rootDir, 'pkg-b', 'existing.ts'), 'export const x = 999');
  g('git add .');
  g('git commit -m "feat: add new + modify existing"');

  const packages: WorkspacePackage[] = [
    { name: 'pkg-a', dir: join(rootDir, 'pkg-a'), relativePath: 'pkg-a', repo: 'test' },
    { name: 'pkg-b', dir: join(rootDir, 'pkg-b'), relativePath: 'pkg-b', repo: 'test' },
  ];

  return { rootDir, packages, base: 'HEAD~1' };
}

// ─── exitcode parser ─────────────────────────────────────────────────────────

describe('runCustomChecks — exitcode parser', () => {
  it('passes when command exits 0', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a'), makePackage(rootDir, 'pkg-b')];
    const checks: QACheckConfig[] = [{
      id: 'echo-check',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      runIn: 'repoRoot',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    expect(results['echo-check']?.failed).toHaveLength(0);
    expect(results['echo-check']?.passed).toHaveLength(1);
  });

  it('fails when command exits non-zero', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a')];
    const checks: QACheckConfig[] = [{
      id: 'fail-check',
      command: 'node',
      args: ['-e', 'process.exit(1)'],
      runIn: 'repoRoot',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    expect(results['fail-check']?.failed).toHaveLength(1);
    expect(results['fail-check']?.passed).toHaveLength(0);
  });
});

// ─── json parser — TypedCheckOutput ──────────────────────────────────────────

describe('runCustomChecks — json parser + TypedCheckOutput', () => {
  it('passes when TypedCheckOutput.ok is true', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a')];
    const checks: QACheckConfig[] = [{
      id: 'typed-pass',
      command: 'node',
      args: ['-e', 'process.stdout.write(JSON.stringify({ok:true,items:[]}))'],
      runIn: 'repoRoot',
      parser: 'json',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    expect(results['typed-pass']?.failed).toHaveLength(0);
    expect(results['typed-pass']?.passed).toHaveLength(1);
  });

  it('fails when TypedCheckOutput.ok is false', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a')];
    const output = JSON.stringify({ ok: false, items: [{ target: 'src/foo.ts', message: 'no test', fix: 'create foo.test.ts' }] });
    const checks: QACheckConfig[] = [{
      id: 'typed-fail',
      command: 'node',
      args: ['-e', `process.stdout.write(${JSON.stringify(output)})`],
      runIn: 'repoRoot',
      parser: 'json',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    expect(results['typed-fail']?.failed).toHaveLength(1);
  });

  it('populates details[] from TypedCheckOutput.items on failure', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a')];
    const items = [
      { target: 'src/foo.ts', message: 'missing test', fix: 'create foo.test.ts' },
      { target: 'src/bar.ts', message: 'missing test' },
    ];
    const output = JSON.stringify({ ok: false, items });
    const checks: QACheckConfig[] = [{
      id: 'typed-details',
      command: 'node',
      args: ['-e', `process.stdout.write(${JSON.stringify(output)})`],
      runIn: 'repoRoot',
      parser: 'json',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    const details = results['typed-details']?.details;
    expect(details).toBeDefined();
    const allItems = Object.values(details!).flat();
    expect(allItems).toHaveLength(2);
    expect(allItems[0]).toMatchObject({ target: 'src/foo.ts', message: 'missing test', fix: 'create foo.test.ts' });
  });

  it('no details when TypedCheckOutput.items is empty', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a')];
    const output = JSON.stringify({ ok: false, items: [] });
    const checks: QACheckConfig[] = [{
      id: 'typed-empty',
      command: 'node',
      args: ['-e', `process.stdout.write(${JSON.stringify(output)})`],
      runIn: 'repoRoot',
      parser: 'json',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    const details = results['typed-empty']?.details;
    expect(!details || Object.keys(details).length === 0).toBe(true);
  });

  it('falls back to legacy json format (success field)', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a')];
    const checks: QACheckConfig[] = [{
      id: 'legacy-json',
      command: 'node',
      args: ['-e', 'process.stdout.write(JSON.stringify({success:true}))'],
      runIn: 'repoRoot',
      parser: 'json',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    expect(results['legacy-json']?.passed).toHaveLength(1);
  });
});

// ─── runIn strategies ────────────────────────────────────────────────────────

describe('runCustomChecks — runIn: perPackage', () => {
  it('runs once per package', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a'), makePackage(rootDir, 'pkg-b')];
    const checks: QACheckConfig[] = [{
      id: 'per-pkg',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      runIn: 'perPackage',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    expect(results['per-pkg']?.passed).toHaveLength(2);
  });

  it('records individual package failures', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-a'), makePackage(rootDir, 'pkg-b')];
    const scriptPath = join(rootDir, 'check.mjs');
    writeFileSync(scriptPath, `
      const cwd = process.cwd();
      process.exit(cwd.includes('pkg-a') ? 1 : 0);
    `);
    const checks: QACheckConfig[] = [{
      id: 'selective-fail',
      command: 'node',
      args: [scriptPath],
      runIn: 'perPackage',
    }];
    const results = runCustomChecks(checks, packages, rootDir);
    expect(results['selective-fail']?.failed).toContain('pkg-a');
    expect(results['selective-fail']?.passed).toContain('pkg-b');
  });
});

// ─── diffOnly ────────────────────────────────────────────────────────────────

describe('runCustomChecks — diffOnly', () => {
  it('runs only on packages touched by diff', () => {
    const { rootDir, packages, base } = makeGitDiffRepo();
    const checks: QACheckConfig[] = [{
      id: 'diff-check',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      runIn: 'diffOnly',
    }];
    const results = runCustomChecks(checks, packages, rootDir, undefined, base);
    expect(results['diff-check']?.passed).toContain('pkg-a');
    expect(results['diff-check']?.skipped).toContain('pkg-b');
  });

  it('skips all packages when diff is empty (same as base)', () => {
    const rootDir = makeTmpDir();
    const g = (cmd: string) => execSync(cmd, { cwd: rootDir, stdio: 'ignore' });
    g('git init');
    g('git config user.email "t@t.com"');
    g('git config user.name "T"');
    mkdirSync(join(rootDir, 'pkg-a'), { recursive: true });
    writeFileSync(join(rootDir, 'pkg-a', 'index.ts'), '');
    g('git add .');
    g('git commit -m "init"');
    // No additional commits — diff against HEAD is empty

    const packages: WorkspacePackage[] = [
      { name: 'pkg-a', dir: join(rootDir, 'pkg-a'), relativePath: 'pkg-a', repo: 'test' },
    ];
    const checks: QACheckConfig[] = [{
      id: 'diff-empty',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      runIn: 'diffOnly',
    }];
    const results = runCustomChecks(checks, packages, rootDir, undefined, 'HEAD');
    expect(results['diff-empty']?.skipped).toHaveLength(1);
    expect(results['diff-empty']?.passed).toHaveLength(0);
  });
});

// ─── newFiles ────────────────────────────────────────────────────────────────

describe('runCustomChecks — newFiles', () => {
  it('runs only on packages with added files, skips modified-only', () => {
    const { rootDir, packages, base } = makeGitNewFilesRepo();
    const checks: QACheckConfig[] = [{
      id: 'new-files-check',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      runIn: 'newFiles',
    }];
    const results = runCustomChecks(checks, packages, rootDir, undefined, base);
    // pkg-a has a brand-new file → ran
    expect(results['new-files-check']?.passed).toContain('pkg-a');
    // pkg-b only has a modified file → skipped
    expect(results['new-files-check']?.skipped).toContain('pkg-b');
  });
});

// ─── progress callback ────────────────────────────────────────────────────────

describe('runCustomChecks — progress callback', () => {
  it('fires progress events for each package', () => {
    const rootDir = makeTmpDir();
    const packages = [makePackage(rootDir, 'pkg-x'), makePackage(rootDir, 'pkg-y')];
    const events: Array<{ pkg: string; status: string }> = [];
    const checks: QACheckConfig[] = [{
      id: 'progress-check',
      command: 'node',
      args: ['-e', 'process.exit(0)'],
      runIn: 'perPackage',
    }];
    runCustomChecks(checks, packages, rootDir, (_, pkg, status) => {
      events.push({ pkg, status });
    });
    expect(events).toHaveLength(2);
    expect(events.every(e => e.status === 'pass')).toBe(true);
  });
});
