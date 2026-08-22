#!/usr/bin/env node

// Dispatch the controlled CI candidate builder and wait for its immutable
// bundle. Release decisions stay in the workflow engine; GitHub Actions only
// executes the supplied intent and returns evidence.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const value = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const required = name => {
  const result = value(name);
  if (!result) throw new Error(`${name} is required`);
  return result;
};

const candidateId = required('--candidate-id');
const commit = required('--commit');
const flow = required('--flow');
const version = required('--version');
const channel = required('--channel');
const workflow = value('--workflow') ?? 'release-build-candidate.yml';
const repository = value('--repository') ?? process.env.GITHUB_REPOSITORY;
const timeoutMs = Number(value('--timeout-ms') ?? 7_200_000);
if (!repository) throw new Error('--repository or GITHUB_REPOSITORY is required');

const run = (command, commandArgs) => execFileSync(command, commandArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const startedAt = Date.now();
run('gh', ['workflow', 'run', workflow, '--repo', repository, '--ref', 'master', '-f', `candidate_id=${candidateId}`, '-f', `commit_sha=${commit}`, '-f', `flow=${flow}`, '-f', `version=${version}`, '-f', `channel=${channel}`]);

let runId;
while (!runId && Date.now() - startedAt < timeoutMs) {
  const runs = JSON.parse(run('gh', ['run', 'list', '--repo', repository, '--workflow', workflow, '--limit', '20', '--json', 'databaseId,headSha,status,createdAt,event']));
  const candidate = runs.find(item => item.event === 'workflow_dispatch' && item.headSha === commit && Date.parse(item.createdAt) >= startedAt - 5_000);
  if (candidate) runId = String(candidate.databaseId);
  if (!runId) execFileSync('sleep', ['5']);
}
if (!runId) throw new Error(`candidate workflow was not observed within ${timeoutMs}ms`);

let result;
while (Date.now() - startedAt < timeoutMs) {
  result = JSON.parse(run('gh', ['run', 'view', runId, '--repo', repository, '--json', 'status,conclusion']));
  if (result.status === 'completed') break;
  execFileSync('sleep', ['10']);
}
if (!result || result.status !== 'completed' || result.conclusion !== 'success') {
  throw new Error(`candidate workflow ${runId} did not succeed: ${JSON.stringify(result)}`);
}

const bundleDir = join('.kb', 'release', 'candidates', candidateId);
mkdirSync(bundleDir, { recursive: true });
run('gh', ['run', 'download', runId, '--repo', repository, '--name', `release-candidate-${candidateId}`, '--dir', bundleDir]);
console.log(`::kb-output::${JSON.stringify({ candidateId, runId, bundleDir })}`);
