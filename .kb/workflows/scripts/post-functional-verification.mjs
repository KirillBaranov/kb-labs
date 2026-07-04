#!/usr/bin/env node
// Step: Post Functional Verification results to PR
// Env: PR_NUMBER, OWNER, REPO, ISSUE_NUMBER, VERIFY_VERDICT, VERIFY_REPORT,
//      VERIFY_CRITERIA_PASSED, VERIFY_CRITERIA_TOTAL
import { runOut, readFileOrEmpty, ghComment } from './lib/kb.mjs';

const { PR_NUMBER, OWNER, REPO, ISSUE_NUMBER, VERIFY_VERDICT, VERIFY_CRITERIA_PASSED, VERIFY_CRITERIA_TOTAL } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

const icon = VERIFY_VERDICT === 'PASSED' ? '✅' : '⚠️';
const status = VERIFY_VERDICT === 'PASSED' ? 'PASSED' : 'NEEDS REVIEW';

const report = process.env.VERIFY_REPORT || readFileOrEmpty(`.kb/run-artifacts/functional-verification-${ISSUE_NUMBER}.md`) || 'Report not available';

// Prepend verdict to PR title so it's visible in the PR list without opening
const currentTitle = runOut('gh', ['pr', 'view', PR_NUMBER, '--repo', REPO_FULL, '--json', 'title', '--jq', '.title']);
const cleanTitle = currentTitle.replace(/^[✅⚠️]\s/, '');
runOut('gh', ['pr', 'edit', PR_NUMBER, '--repo', REPO_FULL, '--title', `${icon} ${cleanTitle}`]);

const body = `## ${icon} Functional Verification — ${status}\n\n**Acceptance criteria**: ${VERIFY_CRITERIA_PASSED || '?'}/${VERIFY_CRITERIA_TOTAL || '?'} passed\n\n${report}`;
ghComment({ number: PR_NUMBER, repoFull: REPO_FULL, body });
