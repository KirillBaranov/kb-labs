#!/usr/bin/env node
// Step: Commit and Push
// Env: ISSUE_NUMBER, ISSUE_TITLE, BRANCH_NAME
import { run, workspaceRoot, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { BRANCH_NAME } = process.env;

run('git', ['add', '-A']);

const staged = run('git', ['diff', '--cached', '--quiet'], { allowFailure: true });
if (staged.status === 0) {
  console.log('No changes to commit.');
  emitKbOutput({ committed: false });
  process.exit(0);
}

// Use the commit plugin to generate a meaningful conventional commit message
// from the actual diff, instead of a generic hardcoded message.
run('pnpm', ['kb', 'commit', 'commit', '--yes']);

run('git', ['push', 'origin', `HEAD:refs/heads/${BRANCH_NAME}`, '--force']);
emitKbOutput({ committed: true });
