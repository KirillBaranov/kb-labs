#!/usr/bin/env node
// Step: Run Tests — actually execute tests for affected packages
import { run, runOut, workspaceRoot, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const affectedOut = runOut('kb-devkit', ['list', '--affected']);
const affected = affectedOut.split('\n').map((s) => s.trim()).filter(Boolean);

if (affected.length === 0) {
  console.log('No affected packages found, skipping tests.');
  emitKbOutput({ passed: true, tested: 0 });
  process.exit(0);
}

console.log('Affected packages:');
console.log(affected.join('\n'));

let failed = 0;
let tested = 0;

for (const pkg of affected) {
  console.log('');
  console.log(`Testing ${pkg}...`);
  const res = run('pnpm', ['--filter', pkg, 'run', 'test:cli'], { allowFailure: true });
  if (res.status === 0) {
    console.log(`✓ ${pkg}`);
    tested++;
    continue;
  }
  // Some packages may not have test:cli — check if script exists
  const ifPresent = run('pnpm', ['--filter', pkg, 'run', '--if-present', 'test:cli'], { allowFailure: true });
  if (ifPresent.status === 0) {
    console.log(`✓ ${pkg} (or no test:cli)`);
    tested++;
  } else {
    console.log(`✗ ${pkg} — tests FAILED`);
    failed++;
  }
}

if (failed > 0) {
  console.log('');
  emitKbOutput({ passed: false, tested, failed });
  process.exit(1);
}

console.log('');
console.log(`All tests passed (${tested} packages tested).`);
emitKbOutput({ passed: true, tested, failed: 0 });
