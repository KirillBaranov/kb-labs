#!/usr/bin/env node
// Step: Agent Resolves Conflicts
// Called when resolve-conflicts.mjs finds real code conflicts that require semantic understanding.
// The agent merges origin/{BASE_BRANCH}, resolves each conflict file, then commits and pushes.
//
// Env: CONFLICT_FILES (JSON array of conflicting file paths), BRANCH_NAME, BASE_BRANCH
import { workspaceRoot, run, runOut, callClaude, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { CONFLICT_FILES, BRANCH_NAME, BASE_BRANCH } = process.env;

if (!/^[A-Za-z0-9._/-]+$/.test(BRANCH_NAME || '')) {
  console.error(`Refusing to push — invalid branch name: ${BRANCH_NAME}`);
  process.exit(1);
}

let conflictList;
try {
  conflictList = JSON.parse(CONFLICT_FILES).join('\n');
} catch {
  conflictList = (CONFLICT_FILES || '').trim();
}

const cwd = process.cwd();
const prompt = `You are working in a git repository. The branch you are on has merge conflicts with origin/${BASE_BRANCH}.

Working directory: ${cwd}
Branch: ${BRANCH_NAME}
Base: ${BASE_BRANCH}

Conflicting files:
${conflictList}

Your task:
1. Run: git fetch origin && git merge origin/${BASE_BRANCH} --no-edit
   (This will fail with conflicts — that is expected.)
2. For each conflicting file, open it and resolve all conflict markers (<<<<<<<, =======, >>>>>>>) by choosing the correct content. Prefer the incoming change (origin/${BASE_BRANCH}) for infrastructure/tooling files. Prefer HEAD for feature implementation files. Use judgment when both sides have meaningful changes — merge them semantically.
3. After resolving all files, run: git add <resolved-files>
4. Run: git merge --continue --no-edit  OR  git commit --no-edit
5. Run: git push origin HEAD:refs/heads/${BRANCH_NAME} --force
6. End with a summary of what you resolved and why.

IMPORTANT: Do NOT abort the merge. Resolve all conflicts and commit.`;

callClaude({ prompt, outputFormat: 'json', mergeStderr: true });

// Verify the merge is actually complete (no unresolved conflicts remain)
const unresolved = runOut('git', ['ls-files', '-u']);
if (unresolved) {
  console.log('ERROR: Agent left unresolved conflicts:');
  const files = [...new Set(unresolved.split('\n').map((l) => l.split(/\s+/)[3]).filter(Boolean))].sort();
  console.log(files.join('\n'));
  process.exit(1);
}

// If agent committed already, just push; otherwise commit what it staged
const status = runOut('git', ['status']);
if (status.includes('nothing to commit')) {
  console.log('Nothing to commit — agent already committed the merge.');
  run('git', ['push', 'origin', `HEAD:refs/heads/${BRANCH_NAME}`, '--force']);
} else {
  run('git', ['add', '-A']);
  const staged = run('git', ['diff', '--cached', '--quiet'], { allowFailure: true });
  if (staged.status !== 0) {
    run('git', ['commit', '-m', `fix: resolve merge conflicts with ${BASE_BRANCH}`]);
    run('git', ['push', 'origin', `HEAD:refs/heads/${BRANCH_NAME}`, '--force']);
  } else {
    console.log('No staged changes after agent run.');
    // Merge may already be committed by agent
    run('git', ['push', 'origin', `HEAD:refs/heads/${BRANCH_NAME}`, '--force']);
  }
}

console.log('Conflicts resolved and pushed by agent.');
emitKbOutput({ resolved: true });
