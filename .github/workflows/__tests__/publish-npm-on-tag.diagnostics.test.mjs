import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../publish-npm-on-tag.yml', import.meta.url), 'utf8');

assert.match(workflow, /Capture release-smoke diagnostics/);
assert.match(workflow, /Upload release-smoke diagnostics/);
assert.match(workflow, /if: always\(\)/);
assert.match(workflow, /processes\.txt/);
assert.match(workflow, /listening-ports\.txt/);
assert.match(workflow, /toolchain\.txt/);
assert.match(workflow, /kb-create-release-smoke-diagnostics/);
