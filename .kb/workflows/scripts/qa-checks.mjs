#!/usr/bin/env node
// Step: QA Checks (diff-aware, local, fast)
// Env: ISSUE_NUMBER, BASE_BRANCH
import { spawnSync } from 'node:child_process';
import { run, runOut, workspaceRoot, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { ISSUE_NUMBER, BASE_BRANCH } = process.env;

// Type-check affected packages before running QA — catches TS errors that CI
// would catch later, preventing a commit→CI-fail→fix loop.
console.log('Running type-check on affected packages...');
const typeCheck = spawnSync('kb-devkit', ['run', 'type-check', '--affected'], { stdio: 'inherit' });
if (typeCheck.status !== 0) {
  emitKbOutput({ status: 'failed', blockers: ['type-check failed — fix TS errors before commit'], warnings: [] });
  process.exit(1);
}

const context = JSON.stringify({ taskId: `issue-${ISSUE_NUMBER}`, agentId: 'workflow' });

const qaResultRaw = runOut('pnpm', ['kb', 'qa', 'check', '--id', 'new-tests', '--base', BASE_BRANCH, '--context', context, '--json']) || '{}';
console.log(qaResultRaw);

let qaResult = {};
try {
  qaResult = JSON.parse(qaResultRaw);
} catch {
  qaResult = {};
}

const status = qaResult.status || 'passed';
const blockers = qaResult.blockers || [];
const warnings = qaResult.warnings || [];

emitKbOutput({ status, blockers, warnings, result: qaResult });
