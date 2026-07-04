#!/usr/bin/env node
// Step: Review open doc-bot inline threads on the PR.
// For each unresolved thread: agent reads the doc page + changed code,
// decides if an update is needed, applies it, then resolves the thread.
import { writeFileSync, mkdirSync } from 'node:fs';
import { workspaceRoot, runOut, callClaude, parseKbOutputLine, emitKbOutput } from './lib/kb.mjs';

process.chdir(workspaceRoot());

const { OWNER, REPO, PR_NUMBER, ISSUE_NUMBER, ISSUE_TITLE } = process.env;
const artifactsDir = '.kb/run-artifacts';
mkdirSync(artifactsDir, { recursive: true });

// Fetch open review comments (inline threads) from docs-bot
const threadsRaw = runOut('gh', [
  'api', `repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/comments`,
  '--jq', '[.[] | select(.body | startswith("📚")) | {id: .id, path: .path, body: .body}]',
]) || '[]';

let threads = [];
try { threads = JSON.parse(threadsRaw); } catch { threads = []; }

if (threads.length === 0) {
  console.log('No open doc threads to review.');
  emitKbOutput({ doc_threads_reviewed: 0, doc_threads_updated: 0 });
  process.exit(0);
}

console.log(`Found ${threads.length} open doc thread(s). Reviewing...`);

const changedFiles = runOut('git', ['diff', '--name-only', 'HEAD']).split('\n').slice(0, 30).join('\n');
const diffStat = runOut('git', ['diff', 'HEAD', '--stat']).split('\n').filter(Boolean).slice(-3).join('\n');

const prompt = `You are a technical writer reviewing documentation accuracy. Write in English.

Issue #${ISSUE_NUMBER}: ${ISSUE_TITLE}

## Changed files in this PR
${changedFiles}

## Change summary
${diffStat}

## Doc threads to review
${threadsRaw}

## Your task

For each thread above:
1. Read the referenced doc file in \`sites/web/apps/docs/content/\` (infer path from the doc slug)
2. Check if the recent code changes affect what the doc describes
3. If the doc needs updating: apply minimal, accurate edits to keep it current. Only change what's actually affected.
4. If the doc is still accurate: no changes needed.

After reviewing ALL threads, reply to each using the GitHub API. Write your reply text to a temp
file first (to avoid any shell-quoting issues with apostrophes/quotes in your own reply), then run:
\`\`\`
gh api repos/${OWNER}/${REPO}/pulls/comments/<comment_id>/replies -X POST -f body=@/tmp/reply.txt
\`\`\`

Reply format:
- If doc updated: "✅ Reviewed and updated: <1 sentence what changed>"
- If doc still accurate: "✅ Reviewed — no changes needed: <1 sentence why it's still accurate>"

Then resolve each thread:
\`\`\`
gh api repos/${OWNER}/${REPO}/pulls/comments/<comment_id> -X PATCH -f resolved=true
\`\`\`

At the very end output exactly one line:
::kb-output::{"doc_threads_reviewed":N,"doc_threads_updated":N}`;

const res = callClaude({ prompt, outputFormat: 'text', noSessionPersistence: true });
const agentOutput = res.stdout;

writeFileSync(`${artifactsDir}/doc-review-${ISSUE_NUMBER}.md`, agentOutput);
console.log(agentOutput.split('\n').filter((l) => !l.startsWith('::kb-output::')).join('\n'));

const parsed = parseKbOutputLine(agentOutput) || {};
const reviewed = Number(parsed.doc_threads_reviewed) || threads.length;
const updated = Number(parsed.doc_threads_updated) || 0;

emitKbOutput({ doc_threads_reviewed: reviewed, doc_threads_updated: updated });
