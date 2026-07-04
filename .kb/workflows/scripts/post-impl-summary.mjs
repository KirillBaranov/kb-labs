#!/usr/bin/env node
// Step: Post Implementation Summary to PR
// Env: ISSUE_NUMBER, OWNER, REPO, PR_NUMBER, IMPL_SUMMARY
import { runOut, ghComment } from './lib/kb.mjs';

const { OWNER, REPO, PR_NUMBER, IMPL_SUMMARY } = process.env;
const REPO_FULL = `${OWNER}/${REPO}`;

const filesRaw = runOut('git', ['diff', 'HEAD', '--name-only']);
const files = filesRaw ? filesRaw.split('\n').filter(Boolean).map((f) => `- \`${f}\``).join('\n') : '';
const diffStat = runOut('git', ['diff', 'HEAD', '--stat']).split('\n').filter(Boolean).slice(-1)[0] || '';

const parts = ['## ⚙️ Implementation', '', IMPL_SUMMARY || ''];
if (files) parts.push('', '**Changed files:**', files);
if (diffStat) parts.push('', `> ${diffStat}`);
parts.push('', '---', '*Developer Agent — implementation complete, awaiting review pipeline*');

ghComment({ number: PR_NUMBER, repoFull: REPO_FULL, body: parts.join('\n') });
