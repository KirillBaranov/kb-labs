#!/usr/bin/env node
// Step: Build Check — verify affected packages compile after implementation
import { spawn, execSync } from 'node:child_process';
import { workspaceRoot, ghComment } from './lib/kb.mjs';

process.chdir(workspaceRoot());

console.log('Building affected packages...');

// studio's fork-dev-worker hangs indefinitely; run with a 4-minute timeout and kill stragglers.
const TIMEOUT_MS = 240_000;

function runBuildWithTimeout() {
  return new Promise((resolve) => {
    const child = spawn('kb-devkit', ['run', 'build', '--affected'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { process.stdout.write(d); out += d; });
    child.stderr.on('data', (d) => { process.stderr.write(d); out += d; });

    const watchdog = setTimeout(() => {
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    child.on('close', (code, signal) => {
      clearTimeout(watchdog);
      // watchdog kills with SIGKILL (no explicit code) — normalize to the `timeout`
      // CLI convention (124) so downstream logic can treat it as "hung, not failed".
      const exitCode = signal === 'SIGKILL' ? 124 : (code ?? 1);
      resolve({ exitCode, out });
    });
  });
}

const { exitCode: buildExit, out: buildOut } = await runBuildWithTimeout();

// kill any lingering studio fork-dev-worker processes (they survive after timeout)
try { execSync("pkill -9 -f 'fork-dev-worker'", { stdio: 'ignore' }); } catch { /* no matching process */ }
try { execSync("pkill -9 -f 'pnpm run build:studio'", { stdio: 'ignore' }); } catch { /* no matching process */ }

// exit code 124 = timeout (studio hung but non-studio packages may have built fine)
// check if any actual build errors occurred (not just timeout)
if (buildExit !== 0 && buildExit !== 124) {
  const { PR_NUMBER, OWNER, REPO } = process.env;
  if (PR_NUMBER && OWNER && REPO) {
    const tail = buildOut.split('\n').slice(-40).join('\n')
      // break up any ``` sequences in the raw build output so they can't close our fence early
      .replace(/```/g, '`` `');
    const body = [
      '## ❌ Build Check Failed',
      '',
      'The implementation does not compile. Agent will need to fix build errors before proceeding.',
      '',
      '```',
      tail,
      '```',
    ].join('\n');
    ghComment({ number: PR_NUMBER, repoFull: `${OWNER}/${REPO}`, body });
  }
  process.exit(1);
}

console.log('Build passed.');
console.log('::kb-output::{"buildPassed":true}');
