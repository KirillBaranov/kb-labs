#!/usr/bin/env node
/**
 * kb-labs-e2e-runner — iterate scenarios in the current e2e package.
 *
 * For each `scenarios/<name>/` directory:
 *   1. `kb-dev ensure --scenario scenarios/<name>/scenario.yaml`
 *   2. `playwright test scenarios/<name>/cases`
 *   3. record result
 *
 * Final step: `kb-dev ensure --scenario default` to reset overlay state so
 * subsequent runs (other domains, manual debugging) start from a clean slate.
 *
 * Exit code:
 *   - 0 only when every scenario applied AND every scenario's Playwright run
 *     returned 0.
 *   - 1 otherwise (with a summary table indicating which scenarios failed).
 *
 * Environment:
 *   KB_DEV_BIN          override the kb-dev binary path (default: `kb-dev`)
 *   KB_LABS_E2E_FILTER  comma-separated scenario names to run (others skipped)
 *   KB_LABS_E2E_NO_RESET=1   skip the final `--scenario default` restore
 *                            (useful when chaining domain runs in CI)
 */

import { readdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const CWD = process.cwd();
const SCENARIOS_DIR = path.join(CWD, 'scenarios');
const KB_DEV = process.env.KB_DEV_BIN || 'kb-dev';
const FILTER = (process.env.KB_LABS_E2E_FILTER || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SKIP_RESET = process.env.KB_LABS_E2E_NO_RESET === '1';

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function listScenarios() {
  if (!(await pathExists(SCENARIOS_DIR))) {
    console.error(`[e2e-runner] no scenarios/ directory in ${CWD}`);
    process.exit(1);
  }
  const entries = await readdir(SCENARIOS_DIR, { withFileTypes: true });
  let dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();

  if (FILTER.length > 0) {
    dirs = dirs.filter((d) => FILTER.includes(d));
    if (dirs.length === 0) {
      console.error(`[e2e-runner] filter matched no scenarios (filter=${FILTER.join(',')})`);
      process.exit(1);
    }
  }

  // Run `default` first when present — it represents the baseline state and
  // any drift it introduces is preserved as the starting point for the next
  // scenario's ensure.
  if (dirs.includes('default')) {
    dirs = ['default', ...dirs.filter((d) => d !== 'default')];
  }
  return dirs;
}

function run(cmd, args, label) {
  return new Promise((resolve) => {
    process.stdout.write(`\n[e2e-runner] ${label}\n[e2e-runner] $ ${cmd} ${args.join(' ')}\n`);
    const proc = spawn(cmd, args, { stdio: 'inherit', cwd: CWD });
    proc.on('error', (err) => {
      process.stderr.write(`[e2e-runner] failed to spawn ${cmd}: ${err.message}\n`);
      resolve(127);
    });
    proc.on('close', (code) => resolve(code ?? 0));
  });
}

async function main() {
  const scenarios = await listScenarios();
  process.stdout.write(
    `[e2e-runner] discovered ${scenarios.length} scenario(s): ${scenarios.join(', ')}\n`,
  );

  const results = [];

  for (const name of scenarios) {
    const yamlPath = path.join(SCENARIOS_DIR, name, 'scenario.yaml');
    const casesDir = path.join(SCENARIOS_DIR, name, 'cases');

    if (!(await pathExists(yamlPath))) {
      results.push({ name, status: 'missing-scenario-yaml' });
      continue;
    }
    if (!(await pathExists(casesDir))) {
      results.push({ name, status: 'missing-cases-dir' });
      continue;
    }

    const applyCode = await run(KB_DEV, ['ensure', '--scenario', yamlPath], `apply scenario "${name}"`);
    if (applyCode !== 0) {
      results.push({ name, status: 'apply-failed', exit: applyCode });
      continue;
    }

    // Pass the cases dir as a positional filter to playwright. The domain's
    // playwright.config.ts has testDir: './scenarios' so the dir is covered.
    const testCode = await run('npx', ['playwright', 'test', casesDir], `run cases for "${name}"`);
    results.push({ name, status: testCode === 0 ? 'pass' : 'fail', exit: testCode });
  }

  if (!SKIP_RESET) {
    await run(KB_DEV, ['ensure', '--scenario', 'default'], 'restore default state');
  }

  process.stdout.write('\n[e2e-runner] === summary ===\n');
  let anyFailed = false;
  for (const r of results) {
    const marker = r.status === 'pass' ? '✓' : '✗';
    let line = `[e2e-runner]   ${marker} ${r.name}: ${r.status}`;
    if (typeof r.exit === 'number' && r.exit !== 0) {
      line += ` (exit ${r.exit})`;
    }
    process.stdout.write(line + '\n');
    if (r.status !== 'pass') {
      anyFailed = true;
    }
  }

  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`[e2e-runner] crashed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
