#!/usr/bin/env node
/**
 * check-assembly-hook — verifies all service bootstrap.ts files import makeAssemblyHook.
 *
 * Devkit external check (TypedCheckOutput v2). Self-filters to @kb-labs/devkit
 * so it runs exactly once (workspace-wide check, same pattern as check-ports).
 *   Input:  KB_DEVKIT_PACKAGE_NAME env or JSON on stdin
 *   Output: { issues: [{ check, severity, message, file }] }
 *
 * Rule: any bootstrap.ts in services/<pkg>/app/src/ or plugins/<pkg>/daemon/src/ that
 * calls runService MUST also import from @kb-labs/plugin-runtime.
 * TypeScript already enforces this at compile time (assemblyHook is a required
 * field); this check provides a human-readable CI gate with clear error messages.
 *
 * Standalone: node scripts/checks/check-assembly-hook.mjs
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const CHECK_NAME = 'check-assembly-hook';
const ANCHOR_PACKAGE = '@kb-labs/devkit';
const DEVKIT_MODE = Boolean(process.env.KB_DEVKIT_MODE);

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');

function rel(p) {
  return relative(ROOT, p);
}

/** Find all bootstrap.ts candidates in service/daemon directories. */
function findBootstrapFiles() {
  const results = [];

  const searchDirs = [
    join(ROOT, 'services'),
    join(ROOT, 'plugins'),
  ];

  for (const searchDir of searchDirs) {
    if (!existsSync(searchDir)) continue;
    for (const pkg of readdirSync(searchDir, { withFileTypes: true })) {
      if (!pkg.isDirectory()) continue;
      const pkgDir = join(searchDir, pkg.name);

      // patterns: services/<pkg>/app/src/ and plugins/<pkg>/daemon/src/
      const candidates = [
        join(pkgDir, 'app', 'src', 'bootstrap.ts'),
        join(pkgDir, 'daemon', 'src', 'bootstrap.ts'),
        // nested daemon (e.g. plugins/state/daemon/core-state-daemon/src/bootstrap.ts)
        ...findNestedBootstraps(pkgDir),
      ];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          results.push(candidate);
        }
      }
    }
  }

  return results;
}

function findNestedBootstraps(dir, depth = 2) {
  const results = [];
  if (depth === 0 || !existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === 'dist') continue;
    const sub = join(dir, entry.name);
    const candidate = join(sub, 'src', 'bootstrap.ts');
    if (existsSync(candidate)) results.push(candidate);
    results.push(...findNestedBootstraps(sub, depth - 1));
  }
  return results;
}

function validate() {
  const issues = [];
  const bootstrapFiles = findBootstrapFiles();

  for (const file of bootstrapFiles) {
    const content = readFileSync(file, 'utf-8');

    // Only check files that call the canonical service runner.
    if (!content.includes('runService')) continue;

    // Must import from @kb-labs/plugin-runtime (makeAssemblyHook lives there)
    if (!content.includes("'@kb-labs/plugin-runtime'") && !content.includes('"@kb-labs/plugin-runtime"')) {
      issues.push({
        check: CHECK_NAME,
        severity: 'error',
        message:
          `${rel(file)}: calls runService but does not import from @kb-labs/plugin-runtime. ` +
          'Add: import { makeAssemblyHook } from \'@kb-labs/plugin-runtime\' and pass assemblyHook: makeAssemblyHook().',
        file: rel(file),
      });
    }
  }

  return issues;
}

function printHuman(issues) {
  if (issues.length === 0) {
    process.stdout.write(`${CHECK_NAME}: OK — all service bootstraps import makeAssemblyHook\n`);
    return;
  }
  for (const i of issues) {
    process.stderr.write(`${i.severity.toUpperCase()}: ${i.message}\n`);
  }
  const errors = issues.filter((i) => i.severity === 'error').length;
  if (errors > 0) {
    process.stderr.write(`\n${CHECK_NAME}: ${errors} error(s) found\n`);
  }
}

if (DEVKIT_MODE) {
  let pkgName = process.env.KB_DEVKIT_PACKAGE_NAME ?? '';
  if (!pkgName) {
    try {
      const chunks = [];
      process.stdin.resume();
      process.stdin.setEncoding('utf-8');
      await new Promise((resolve) => {
        process.stdin.on('data', (c) => chunks.push(c));
        process.stdin.on('end', () => resolve());
        setTimeout(() => resolve(), 50);
      });
      const raw = chunks.join('');
      if (raw) pkgName = JSON.parse(raw)?.name ?? '';
    } catch { /* no JSON on stdin */ }
  }

  if (pkgName !== ANCHOR_PACKAGE) {
    process.stdout.write(JSON.stringify({ issues: [] }) + '\n');
    process.exit(0);
  }

  const issues = validate();
  process.stdout.write(JSON.stringify({ issues }) + '\n');
  process.exit(0); // devkit aggregates severity; never hard-fail the runner
} else {
  const issues = validate();
  printHuman(issues);
  process.exit(issues.some((i) => i.severity === 'error') ? 1 : 0);
}
