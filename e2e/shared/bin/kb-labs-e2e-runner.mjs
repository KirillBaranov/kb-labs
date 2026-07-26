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
 *   KB_DEV_BIN              override the kb-dev binary path (default: `kb-dev`).
 *                           Set this to a wrapper (e.g.
 *                           `tools/scripts/kb-dev-docker.sh`) when the runner
 *                           must reach a containerised kb-dev — the runner
 *                           itself has no notion of containers.
 *   KB_LABS_E2E_FILTER      comma-separated scenario names to run (others skipped)
 *   KB_LABS_E2E_NO_RESET=1  skip the final `--scenario default` restore
 *                           (useful when chaining domain runs in CI)
 */

import { readdir, access, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createDiagnosticCollector } from './diagnostics.mjs';

const CWD = process.cwd();
const SCENARIOS_DIR = path.join(CWD, 'scenarios');
const KB_DEV = process.env.KB_DEV_BIN || 'kb-dev';
const FILTER = (process.env.KB_LABS_E2E_FILTER || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SKIP_RESET = process.env.KB_LABS_E2E_NO_RESET === '1';
const E2E_RUN_ID = process.env.E2E_RUN_ID || `e2e-${Date.now()}`;
const DIAGNOSTICS_ROOT = process.env.E2E_DIAGNOSTICS_DIR || path.join(CWD, 'report', 'diagnostics');

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

    const collector = createDiagnosticCollector({
      runId: `${E2E_RUN_ID}-${name}`,
      rootDir: path.join(DIAGNOSTICS_ROOT, name),
      suite: path.basename(CWD),
      scenario: name,
      cwd: CWD,
    });
    await collector.init();

    const diagnosticEnv = {
      E2E_DIAGNOSTICS_RUN_ID: collector.runId,
      E2E_DIAGNOSTICS_PATH: collector.rootDir,
      E2E_DIAGNOSTICS_REF: path.relative(CWD, collector.rootDir),
    };

    const apply = await collector.runCommand(KB_DEV, ['ensure', '--scenario', yamlPath], `apply scenario "${name}"`);
    const applyCode = apply.code;
    if (applyCode !== 0) {
      results.push({ name, status: 'apply-failed', exit: applyCode });
      await collector.finalize({ status: 'failed', failurePhase: 'setup', failureKind: 'scenario-apply' });
      continue;
    }

    // Pass the cases dir as a positional filter to playwright. The domain's
    // playwright.config.ts has testDir: './scenarios' so the dir is covered.
    const test = await collector.runCommand('npx', ['playwright', 'test', casesDir], `run cases for "${name}"`, CWD, diagnosticEnv);
    const testCode = test.code;
    results.push({ name, status: testCode === 0 ? 'pass' : 'fail', exit: testCode });
    await collector.finalize({ status: testCode === 0 ? 'passed' : 'failed', failurePhase: testCode === 0 ? undefined : 'test', failureKind: testCode === 0 ? undefined : 'test-failure' });
  }

  if (!SKIP_RESET) {
    const reset = createDiagnosticCollector({
      runId: `${E2E_RUN_ID}-reset`,
      rootDir: path.join(DIAGNOSTICS_ROOT, 'reset'),
      suite: path.basename(CWD),
      scenario: 'reset',
      cwd: CWD,
    });
    await reset.init();
    const result = await reset.runCommand(KB_DEV, ['ensure', '--scenario', 'default'], 'restore default state');
    await reset.finalize({ status: result.code === 0 ? 'passed' : 'failed', failurePhase: result.code === 0 ? undefined : 'teardown', failureKind: result.code === 0 ? undefined : 'scenario-reset' });
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

  // Write a structured summary into the domain's report/ so it survives
  // wrappers that capture/truncate stdout (kb-devkit, in particular). CI
  // uploads `report/` as an artifact; this gives reviewers per-scenario
  // pass/fail without having to mine the merged stdout.
  await writeSummary(results);

  process.exit(anyFailed ? 1 : 0);
}

async function writeSummary(results) {
  const reportDir = path.join(CWD, 'report');
  try {
    await mkdir(reportDir, { recursive: true });
    const payload = {
      domain: path.basename(CWD),
      scenarios: results,
      anyFailed: results.some((r) => r.status !== 'pass'),
      timestamp: new Date().toISOString(),
    };
    await writeFile(
      path.join(reportDir, 'scenarios-summary.json'),
      JSON.stringify(payload, null, 2),
      'utf8',
    );
  } catch (err) {
    process.stderr.write(
      `[e2e-runner] note: failed to write scenarios-summary.json: ${err?.message ?? err}\n`,
    );
  }
}

main().catch((err) => {
  process.stderr.write(`[e2e-runner] crashed: ${err?.stack ?? err}\n`);
  process.exit(1);
});
