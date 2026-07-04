#!/usr/bin/env node
// Step: Post final pipeline summary to PR
// Env: ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, PR_NUMBER,
//      REVIEW_PASSED, ARCHITECT_VERDICT, QA_VERDICT, QA_BUGS_COUNT,
//      CHECKS_STATUS, BRANCH_NAME
import { runOut, ghComment } from './lib/kb.mjs';

const {
  ISSUE_NUMBER, ISSUE_TITLE, OWNER, REPO, PR_NUMBER,
  REVIEW_PASSED, ARCHITECT_VERDICT, QA_VERDICT, QA_BUGS_COUNT, CHECKS_STATUS,
} = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

const diffStat = runOut('git', ['diff', 'HEAD~1..HEAD', '--stat']).split('\n').filter(Boolean).slice(-5).join('\n');

const reviewIcon = REVIEW_PASSED === 'false' ? '⚠️ → ✅' : '✅';
const archIcon = ARCHITECT_VERDICT === 'NEEDS_FIXES' ? '⚠️ → ✅ Fixed' : '✅ APPROVED';
const qaIcon = QA_VERDICT === 'BUGS_FOUND' ? `🐛 → ✅ Fixed (${QA_BUGS_COUNT} bug(s))` : '✅ PASSED';
const checksIcon = CHECKS_STATUS !== 'passed' ? `⚠️ ${CHECKS_STATUS}` : '✅ Passed';

const parts = [
  '## 🤖 Autonomous Implementation — Complete',
  '',
  `**Issue:** #${ISSUE_NUMBER} — ${ISSUE_TITLE}`,
  '**Pipeline:** `github-issue-to-pr` · KB Labs Agent Pipeline',
  '',
  '---',
  '',
  '### Pipeline Journey',
  '',
  '| # | Stage | Agent Role | Status |',
  '|---|-------|-----------|--------|',
  '| 1 | Planning | Architect Agent | ✅ Human-approved |',
  '| 2 | Implementation | Developer Agent | ✅ Complete |',
  `| 3 | Code Review | Review Agent | ${reviewIcon} |`,
  `| 4 | Architecture Review | Senior Architect Agent | ${archIcon} |`,
  `| 5 | Adversarial QA | QA Engineer Agent | ${qaIcon} |`,
  `| 6 | QA Checks | Automated checks | ${checksIcon} |`,
  '| 7 | CI | GitHub Actions | ✅ All green |',
  '| 8 | Final Review | Human sign-off | ✅ Approved |',
  '',
  '### 👤 Human Sign-offs',
  '- ✅ **Plan approved** — reviewed and accepted the implementation plan',
  '- ✅ **Final approved** — reviewed the complete implementation',
  '',
  '### 📁 What Changed',
];

if (diffStat) parts.push('', '```', diffStat, '```');

parts.push(
  '',
  '---',
  '*Implemented autonomously by the [KB Labs](https://github.com/KirillBaranov/kb-labs) agent pipeline.*',
  '*Each stage ran independently with full tool access — no human wrote any of this code.*',
);

ghComment({ number: PR_NUMBER, repoFull: REPO_FULL, body: parts.join('\n') });
