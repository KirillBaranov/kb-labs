#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sdkRepoHint = path.resolve(__dirname, '../../..');
const glossaryPath = 'packages/sdk/EXPORTS-GLOSSARY.md';
const breakingAckPath = 'packages/sdk/BREAKING_CHANGE.md';

function run(cmd, cwd) {
  return execSync(cmd, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();
}

function parseGlossary(content) {
  const rows = [];
  let section = '(unknown)';

  for (const line of content.split('\n')) {
    const sectionMatch = line.match(/^##\s+`(.+)`$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      continue;
    }

    const rowMatch = line.match(/^\| `(.+)` \| `(value|type)` \| `(.+)` \|$/);
    if (!rowMatch) {
      continue;
    }

    rows.push({
      entrypoint: section,
      exportName: rowMatch[1],
      kind: rowMatch[2],
      from: rowMatch[3],
    });
  }

  return rows;
}

function toKey(row) {
  return `${row.entrypoint}::${row.exportName}::${row.kind}::${row.from}`;
}

function getBaseRef() {
  const explicit = process.env.SDK_BASE_REF?.trim();
  if (explicit) {
    return explicit;
  }

  const event = process.env.GITHUB_EVENT_NAME;
  if (event === 'pull_request') {
    return process.env.GITHUB_BASE_REF?.trim() || '';
  }

  return '';
}

function resolveRepoRoot() {
  return run('git rev-parse --show-toplevel', sdkRepoHint);
}

function resolveBaseRef(baseRef, repoRoot) {
  const candidates = [`origin/${baseRef}`, baseRef];
  for (const candidate of candidates) {
    try {
      run(`git rev-parse --verify ${candidate}`, repoRoot);
      return candidate;
    } catch {
      // Try next candidate
    }
  }
  return '';
}

async function main() {
  const repoRoot = resolveRepoRoot();
  const baseRef = getBaseRef();
  if (!baseRef) {
    process.stdout.write('Skipping API removal check: no base ref context.\n');
    return;
  }

  const resolvedBaseRef = resolveBaseRef(baseRef, repoRoot);
  if (!resolvedBaseRef) {
    process.stdout.write(`Skipping API removal check: cannot resolve base ref ${baseRef}.\n`);
    return;
  }

  const headGlossary = await readFile(path.join(repoRoot, glossaryPath), 'utf8');

  let baseGlossary = '';
  try {
    baseGlossary = run(`git show ${resolvedBaseRef}:${glossaryPath}`, repoRoot);
  } catch {
    process.stdout.write(`Base glossary not found at ${resolvedBaseRef}:${glossaryPath}. Skipping.\n`);
    return;
  }

  const baseRows = parseGlossary(baseGlossary);
  const headRows = parseGlossary(headGlossary);

  const headKeys = new Set(headRows.map(toKey));
  const removed = baseRows.filter((row) => !headKeys.has(toKey(row)));

  if (removed.length === 0) {
    process.stdout.write('No removed SDK API exports detected.\n');
    return;
  }

  const changedFiles = run(`git diff --name-only ${resolvedBaseRef}...HEAD`, repoRoot)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const hasAckUpdate = changedFiles.includes(breakingAckPath);
  if (hasAckUpdate) {
    process.stdout.write(
      `Detected ${removed.length} removed API exports, but ${breakingAckPath} is updated in this PR. Allowing.\n`
    );
    return;
  }

  process.stderr.write('Breaking SDK API removals detected:\n');
  for (const row of removed.slice(0, 30)) {
    process.stderr.write(
      `- ${row.entrypoint}: ${row.exportName} [${row.kind}] from ${row.from}\n`
    );
  }
  if (removed.length > 30) {
    process.stderr.write(`... and ${removed.length - 30} more\n`);
  }

  process.stderr.write(
    `\nTo acknowledge this breaking change, update ${breakingAckPath} in the same PR with migration notes.\n`
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
