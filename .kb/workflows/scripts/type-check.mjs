#!/usr/bin/env node
// Step: Type Check — affected packages only
import { spawnSync } from 'node:child_process';
import { workspaceRoot, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

console.log('Running type-check on affected packages...');
const res = spawnSync('kb-devkit', ['run', 'type-check', '--affected'], { stdio: 'inherit' });

if (res.status !== 0) {
  emitKbOutput({ passed: false });
  process.exit(1);
}

console.log('Type-check passed.');
emitKbOutput({ passed: true });
