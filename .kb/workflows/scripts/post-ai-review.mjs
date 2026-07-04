#!/usr/bin/env node
// Step: Post AI Review findings to PR
// Env: PR_NUMBER, OWNER, REPO, REVIEW_PASSED, REVIEW_ISSUES_COUNT, REVIEW_SUMMARY
import { ghComment } from './lib/kb.mjs';

const { PR_NUMBER, OWNER, REPO, REVIEW_PASSED, REVIEW_ISSUES_COUNT, REVIEW_SUMMARY } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

const body = REVIEW_PASSED === 'true'
  ? '## ✅ Code Review — Passed\n\nNo issues found. Implementation looks good.'
  : `## 🔍 Code Review — ${REVIEW_ISSUES_COUNT} issue(s) found\n\n${REVIEW_SUMMARY}\n\n---\n*Agent will address these issues and a re-run will confirm resolution.*`;

ghComment({ number: PR_NUMBER, repoFull: REPO_FULL, body });
