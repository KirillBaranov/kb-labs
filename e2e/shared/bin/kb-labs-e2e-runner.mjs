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
 *   KB_DEV_BIN              override the kb-dev binary path (default: `kb-dev`)
 *   KB_LABS_E2E_FILTER      comma-separated scenario names to run (others skipped)
 *   KB_LABS_E2E_NO_RESET=1  skip the final `--scenario default` restore
 *                           (useful when chaining domain runs in CI)
 *   KB_LABS_E2E_DOCKER_TARGET   when set, route every kb-dev invocation through
 *                               `docker compose exec -T -w <workdir> <target>
 *                               kb-dev …`. Used by CI runs where the platform
 *                               lives in a container and the runner is on the
 *                               GitHub Actions host. The host's `e2e/` tree
 *                               must be bind-mounted into the container at
 *                               KB_LABS_E2E_DOCKER_E2E_HOST_PATH (default
 *                               `/workspace/e2e-host`) so the container's
 *                               kb-dev can read scenario.yaml + overlay files.
 *   KB_LABS_E2E_DOCKER_WORKDIR  workdir for docker exec (default
 *                               `/workspace/kb-e2e` — the kb-create scaffolded
 *                               project inside the platform container).
 *   KB_LABS_E2E_DOCKER_E2E_HOST_PATH  container path the host's `e2e/` is
 *                                     mounted at (default `/workspace/e2e-host`).
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

// Docker-mode routing. When KB_LABS_E2E_DOCKER_TARGET is set, every kb-dev
// call is wrapped in `docker compose exec -T -w <workdir> <target> kb-dev …`
// and scenario file paths are rewritten from host (CWD-relative) to
// container (under DOCKER_E2E_HOST_PATH). This lets CI runs apply scenarios
// against a platform that lives in a sibling container without the runner
// needing to be inside the container itself.
const DOCKER_TARGET = process.env.KB_LABS_E2E_DOCKER_TARGET || '';
const DOCKER_WORKDIR = process.env.KB_LABS_E2E_DOCKER_WORKDIR || '/workspace/kb-e2e';
const DOCKER_E2E_HOST_PATH = process.env.KB_LABS_E2E_DOCKER_E2E_HOST_PATH || '/workspace/e2e-host';

// Host path to `<repo>/e2e/` — derived from CWD, which the runner expects
// to be `<repo>/e2e/<domain>`. Only used when DOCKER_TARGET is set, to
// translate scenario paths into their container-side equivalents.
const HOST_E2E_ROOT = path.dirname(CWD);
const DOMAIN_NAME = path.basename(CWD);

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

// Build the command + args for a `kb-dev` invocation, honouring Docker
// routing when DOCKER_TARGET is set. In Docker mode the scenario path
// must be in the container's filesystem — we translate host paths under
// HOST_E2E_ROOT to their DOCKER_E2E_HOST_PATH equivalents. The literal
// `default` scenario name has no path component and passes through.
function kbDevInvocation(subargs, scenarioYamlHostPath) {
  if (!DOCKER_TARGET) {
    return { cmd: KB_DEV, args: subargs };
  }
  const translated = subargs.map((arg) => {
    if (arg === scenarioYamlHostPath && scenarioYamlHostPath) {
      const rel = path.relative(HOST_E2E_ROOT, scenarioYamlHostPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(
          `cannot translate scenario path ${scenarioYamlHostPath}: not under ${HOST_E2E_ROOT}`,
        );
      }
      return path.posix.join(DOCKER_E2E_HOST_PATH, rel.split(path.sep).join('/'));
    }
    return arg;
  });
  return {
    cmd: 'docker',
    args: ['compose', 'exec', '-T', '-w', DOCKER_WORKDIR, DOCKER_TARGET, 'kb-dev', ...translated],
  };
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

    const applyInv = kbDevInvocation(['ensure', '--scenario', yamlPath], yamlPath);
    const applyCode = await run(applyInv.cmd, applyInv.args, `apply scenario "${name}"`);
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
    const resetInv = kbDevInvocation(['ensure', '--scenario', 'default'], '');
    await run(resetInv.cmd, resetInv.args, 'restore default state');
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
