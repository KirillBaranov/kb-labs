import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeSuites, hasAffectedAuth } from './affected-plugin-e2e.mjs';

test('empty or workflow-only diff does not invent a plugin suite', () => {
  assert.deepEqual(computeSuites(), []);
});

test('global CI and E2E infrastructure changes select every Docker E2E suite', () => {
  for (const changedFile of [
    '.github/workflows/e2e-plugins.yml',
    'e2e/shared/fixtures.ts',
    'e2e/docker-compose.yml',
    'scripts/ci/affected-plugin-e2e.mjs',
    'pnpm-lock.yaml',
  ]) {
    assert.deepEqual(computeSuites({ changedFiles: [changedFile] }), [
      'mind', 'workflows', 'marketplace', 'plugins', 'services', 'platform',
      'gateway', 'marketplace-registry', 'studio', 'rest-api', 'mcp',
    ]);
  }
});

test('direct changes in an e2e suite select that suite', () => {
  assert.deepEqual(
    computeSuites({ changedFiles: ['e2e/mind/scenarios/default/cases/search.spec.ts'] }),
    ['mind'],
  );
});

test('workspace dependency changes select the transitive suite', () => {
  assert.deepEqual(computeSuites({ affected: ['@kb-labs/mind-core'] }), ['mind']);
});

test('shared dependency selects every suite that declares it', () => {
  assert.deepEqual(
    computeSuites({ affected: ['@kb-labs/rest-api-app'] }),
    ['mind', 'workflows', 'plugins', 'services', 'platform', 'gateway', 'studio', 'rest-api'],
  );
});

test('auth selection follows its workspace dependencies and shared E2E changes', () => {
  assert.equal(hasAffectedAuth({ affected: ['@kb-labs/gateway-auth'] }), true);
  assert.equal(hasAffectedAuth({ affected: ['@kb-labs/mind-core'] }), false);
  assert.equal(hasAffectedAuth({ changedFiles: ['e2e/auth/specs/login.spec.ts'] }), true);
  assert.equal(hasAffectedAuth({ changedFiles: ['e2e/shared/fixtures.ts'] }), true);
});
