#!/usr/bin/env node
/**
 * Pre-flight checks for the release pipeline.
 * Runs BEFORE the build so failures are caught immediately, not after 10+ minutes.
 *
 * Checks:
 *   1. NPM_TOKEN or NODE_AUTH_TOKEN is set
 *   2. npm whoami succeeds with that token (verifies token validity)
 *
 * Exit 0 = all good. Exit 1 = at least one check failed (errors printed to stderr).
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Load .env from project root (same logic as CLI bootstrap — never overrides existing vars)
const envPath = join(process.cwd(), '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["'`](.*)["'`]$/, '$1');
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const token = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;
const registry = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';

const errors = [];

if (!token) {
  errors.push('NPM_TOKEN or NODE_AUTH_TOKEN is not set');
} else {
  try {
    const res = await fetch(`${registry}/-/whoami`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      errors.push(`npm token invalid or expired (HTTP ${res.status} from ${registry})`);
    }
  } catch (e) {
    errors.push(`npm registry unreachable: ${e.message}`);
  }
}

if (errors.length > 0) {
  for (const e of errors) {
    process.stderr.write(`\nERR  ${e}\n`);
  }
  process.stderr.write('\nFix the above before running the release.\n\n');
  process.exit(1);
}

process.stdout.write('Pre-flight OK\n');
