import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildEvidence, readArtifactLogForJob, renderMarkdown } from './ci-evidence-summary.mjs';

const fixtureDir = fileURLToPath(new URL('./fixtures/ci-evidence/', import.meta.url));

const jobs = [
  { id: 1, name: 'E2E / services', conclusion: 'failure', html_url: 'https://example.test/1', steps: [{ name: 'Wait for platform to be healthy', conclusion: 'failure' }, { name: 'Run e2e tests', conclusion: 'skipped' }] },
  { id: 2, name: 'E2E / gateway', conclusion: 'failure', html_url: 'https://example.test/2', steps: [{ name: 'Wait for platform to be healthy', conclusion: 'failure' }, { name: 'Run e2e tests', conclusion: 'skipped' }] },
  { id: 3, name: 'Unit tests', conclusion: 'failure', html_url: 'https://example.test/3', steps: [{ name: 'Run tests', conclusion: 'failure' }] },
];

test('groups the same startup cause and identifies tests that did not run', () => {
  const log = 'platform-1 | [ERROR] Service setup failed {"event":"service.failed","error":{"message":"Gateway requires the serviceTransport adapter"}}';
  const report = buildEvidence(jobs, new Map([[1, log], [2, log], [3, 'AssertionError: expected true']]));
  assert.equal(report.incidents.length, 2);
  assert.equal(report.incidents[0].fingerprint, 'gateway.service-transport-required');
  assert.equal(report.incidents[0].jobs.length, 2);
  assert.equal(report.incidents[0].jobs[0].testsStarted, false);
  assert.equal(report.totals.testsStarted, 1);
  assert.doesNotMatch(report.incidents[0].evidence, /\n/);
});

test('renders links and the execution boundary for the agent-facing summary', () => {
  const report = buildEvidence(jobs, new Map());
  const markdown = renderMarkdown(report);
  assert.match(markdown, /Failed jobs that started tests: \*\*1\*\*/);
  assert.match(markdown, /\[E2E \/ services\]\(https:\/\/example\.test\/1\)/);
});

test('does not merge jobs when their own evidence has different fingerprints', () => {
  const report = buildEvidence(jobs.slice(0, 2), new Map([
    [1, 'platform-1 | [ERROR] Service setup failed {"event":"service.failed","error":{"message":"Gateway requires the serviceTransport adapter"}}'],
    [2, 'platform-1 | [ERROR] Service setup failed {"event":"service.failed","error":{"message":"Gateway requires the auth adapter"}}'],
  ]));
  assert.equal(report.incidents.length, 2);
  assert.equal(report.incidents.every(incident => incident.jobs.length === 1), true);
});

test('reads diagnostics only from the artifact belonging to the failed job suite', () => {
  const services = readArtifactLogForJob(fixtureDir, 'docker-e2e (services) / E2E / services');
  const auth = readArtifactLogForJob(fixtureDir, 'auth-e2e / E2E / auth');
  assert.match(services, /serviceTransport/);
  assert.doesNotMatch(services, /auth adapter/);
  assert.match(auth, /auth adapter/);
  assert.doesNotMatch(auth, /serviceTransport/);
});
