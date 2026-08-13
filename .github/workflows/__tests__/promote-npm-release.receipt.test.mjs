import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../promote-npm-release.yml', import.meta.url), 'utf8');

assert.match(workflow, /Build immutable release receipt/);
assert.match(workflow, /release-receipt\.json/);
assert.match(workflow, /candidateRunId/);
assert.match(workflow, /manifestSha256/);
assert.match(workflow, /\.candidate\.smoke == "passed"/);
assert.match(workflow, /\.promotion\.verified == true/);
assert.match(workflow, /release-receipt\.json\n/);
