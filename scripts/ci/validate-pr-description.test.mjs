import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validate, validateBody, validateTitle } from './validate-pr-description.mjs';

const goodBody = `
## What

Add a validate-pr-description script that checks title and body structure.

## Why

Keep PR descriptions consistent and reviewable across the workspace.

## How verified

Ran the new unit tests with node --test.

## Plan / Reference

<!-- Link to the plan, ticket, or design doc this PR follows, if any -->

## Checklist

- [ ] pnpm check:affected passes
`;

test('accepts a conventional title with a real message', () => {
  assert.deepEqual(validateTitle('feat(release): add validate-pr-description script'), []);
});

test('accepts an optional trailing task tag', () => {
  assert.deepEqual(validateTitle('fix(cli): reject empty PR titles [CU-123]'), []);
});

test('rejects a title with no type prefix', () => {
  const errors = validateTitle('added the thing');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /must look like/);
});

test('rejects a generic message even with a valid type', () => {
  const errors = validateTitle('fix: wip');
  assert.equal(errors.length, 1);
  assert.match(errors[0], /too generic/);
});

test('accepts a fully filled-in body', () => {
  assert.deepEqual(validateBody(goodBody), []);
});

test('flags missing sections', () => {
  const errors = validateBody('## What\n\nDid a thing that matters here.\n');
  assert.deepEqual(errors, [
    'Missing "## Why" section — see .github/PULL_REQUEST_TEMPLATE.md.',
    'Missing "## How verified" section — see .github/PULL_REQUEST_TEMPLATE.md.',
    'Missing "## Plan / Reference" section — see .github/PULL_REQUEST_TEMPLATE.md.',
    'Missing "## Checklist" section — see .github/PULL_REQUEST_TEMPLATE.md.',
  ]);
});

test('flags a section left as only the template placeholder', () => {
  const body = goodBody.replace(
    'Add a validate-pr-description script that checks title and body structure.',
    '<!-- What did you actually change? -->',
  );
  const errors = validateBody(body);
  assert.deepEqual(errors, ['"## What" is empty or still just the template placeholder — fill it in.']);
});

test('validate combines title and body errors', () => {
  const errors = validate({ title: 'wip', body: '' });
  assert.ok(errors.length >= 2);
});
