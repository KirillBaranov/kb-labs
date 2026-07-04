// Shared helpers for task-to-pr workflow step scripts.
// All external-command invocation goes through argv arrays (spawnSync/spawn), never
// through a shell string — so untrusted content (issue titles/bodies, AI-generated
// summaries, build output, etc.) can never be re-parsed as shell syntax.
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function workspaceRoot() {
  return process.env.KB_WORKSPACE_ROOT || process.cwd();
}

export function mktemp(prefix = 'kb-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return join(dir, 'f');
}

export function writeTemp(content, prefix = 'kb-') {
  const file = mktemp(prefix);
  writeFileSync(file, content);
  return file;
}

/**
 * Run a command with argv array (no shell). Throws on nonzero exit unless allowFailure.
 */
export function run(cmd, args = [], opts = {}) {
  const { cwd, input, allowFailure = false, env } = opts;
  const res = spawnSync(cmd, args, {
    cwd,
    input,
    env: env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
  });
  if (res.error) {
    if (allowFailure) return { status: 1, stdout: '', stderr: String(res.error) };
    throw res.error;
  }
  if (res.status !== 0 && !allowFailure) {
    const err = new Error(`${cmd} ${args.join(' ')} exited ${res.status}\n${res.stderr || ''}`);
    err.status = res.status;
    err.stdout = res.stdout;
    err.stderr = res.stderr;
    throw err;
  }
  return res;
}

/** Run and return trimmed stdout; never throws (mirrors `$(cmd 2>/dev/null || echo '')`). */
export function runOut(cmd, args = [], opts = {}) {
  const res = run(cmd, args, { ...opts, allowFailure: true });
  return (res.stdout || '').trim();
}

/** Redact common secret shapes before posting text externally (PR/issue comments). */
export function sanitizeSecrets(text) {
  return text
    .replace(/gho_[A-Za-z0-9]{10,}/g, '[REDACTED]')
    .replace(/ghp_[A-Za-z0-9]{10,}/g, '[REDACTED]')
    .replace(/ghs_[A-Za-z0-9]{10,}/g, '[REDACTED]')
    .replace(/ghr_[A-Za-z0-9]{10,}/g, '[REDACTED]')
    .replace(/github_pat_[A-Za-z0-9_]{10,}/g, '[REDACTED]')
    .replace(/sk-ant-[A-Za-z0-9_-]{10,}/g, '[REDACTED]')
    .replace(/sk-[A-Za-z0-9]{32,}/g, '[REDACTED]')
    .replace(/AKIA[A-Z0-9]{16}/g, '[REDACTED]')
    .replace(/ASIA[A-Z0-9]{16}/g, '[REDACTED]')
    .replace(/[A-Za-z0-9/+]{40}([^A-Za-z0-9/+=]|$)/g, '[REDACTED]$1')
    .replace(/:\/\/[^/:@]+:[^/:@]+@/g, '://[REDACTED]:[REDACTED]@')
    .replace(/(password|passwd|secret|token|api_key|apikey|access_key|private_key)([ ]*[=:]["' ]*)[^ '">,\n]{6,}/gi, '$1$2[REDACTED]')
    .replace(/-----BEGIN [A-Z ]+ PRIVATE KEY-----[^-]*-----END [A-Z ]+ PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[REDACTED JWT]');
}

/** Print the workflow engine's structured-output line. */
export function emitKbOutput(obj) {
  process.stdout.write('::kb-output::' + JSON.stringify(obj) + '\n');
}

/**
 * Extract and parse the final `::kb-output::{...}` line from free-form agent text.
 * Anchoring to this exact line (rather than regex-scanning the whole text) avoids
 * picking up matching-looking substrings from the model's own prose.
 */
export function parseKbOutputLine(text) {
  const lines = (text || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('::kb-output::')) {
      try {
        return JSON.parse(lines[i].slice('::kb-output::'.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Post (or update) a PR/issue comment body safely: secrets redacted, sent via --body-file. */
export function ghComment({ kind = 'pr', number, repoFull, body, allowFailure = true }) {
  const file = writeTemp(sanitizeSecrets(body));
  const args = [kind, 'comment', String(number), '--repo', repoFull, '--body-file', file];
  return run('gh', args, { allowFailure });
}

/**
 * Invoke the `claude` CLI. `prompt` is passed as a `-p` argv element (never interpolated
 * into a shell string) unless `viaStdin` is set, matching the two invocation styles used
 * across the pipeline's step scripts.
 */
export function callClaude({
  prompt,
  viaStdin = false,
  resume,
  outputFormat = 'json',
  model = 'sonnet',
  noSessionPersistence = false,
  mergeStderr = false,
  cwd,
} = {}) {
  const args = [];
  if (!viaStdin) args.push('-p', prompt);
  args.push('--output-format', outputFormat, '--model', model, '--dangerously-skip-permissions');
  if (noSessionPersistence) args.push('--no-session-persistence');
  if (resume) args.push('--resume', resume);

  const res = spawnSync('claude', args, {
    cwd,
    input: viaStdin ? prompt : undefined,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 256,
    stdio: ['pipe', 'pipe', mergeStderr ? 'pipe' : 'ignore'],
  });
  return {
    status: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

/** Parse `claude --output-format json` stdout into { result, session_id }. Never throws. */
export function parseClaudeJson(stdout) {
  try {
    const d = JSON.parse(stdout);
    return { result: d.result || '', sessionId: d.session_id || '' };
  } catch {
    return { result: '', sessionId: '' };
  }
}

export function readFileOrEmpty(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

export function fileExists(path) {
  return existsSync(path);
}
