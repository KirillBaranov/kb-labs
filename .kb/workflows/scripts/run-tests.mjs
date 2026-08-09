#!/usr/bin/env node
// Step: Run Tests — execute the affected test closure for the current change.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { workspaceRoot, emitKbOutput } from './lib/kb.mjs';

const root = workspaceRoot();
process.chdir(root);

console.log('Running tests for affected packages...');
const res = spawnSync(join(root, 'tools/kb-devkit/kb-devkit'), ['run', 'test', '--affected'], { stdio: 'inherit' });

if (res.status !== 0) {
  emitKbOutput({ passed: false });
  process.exit(res.status ?? 1);
}

console.log('Affected tests passed.');
emitKbOutput({ passed: true });
