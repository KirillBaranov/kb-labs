import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = new URL('./prepare-binary-manifest.mjs', import.meta.url);

test('creates exact binary URLs and hashes from GoReleaser checksums', () => {
  const root = mkdtempSync(join(tmpdir(), 'kb-binary-manifest-'));
  const checksums = join(root, 'checksums.txt');
  const output = join(root, 'binary-manifest.json');
  writeFileSync(checksums, `${'a'.repeat(64)}  kb-create-linux-amd64\n${'b'.repeat(64)}  kb-dev-windows-amd64.exe\nnot-an-asset\n`);
  execFileSync(process.execPath, [script.pathname, '--checksums', checksums, '--repository', 'kb-labs-team/kb-labs', '--release-tag', 'v2.3.4-binaries', '--output', output]);
  assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), { binaries: [
    { id: 'kb-create', os: 'linux', arch: 'amd64', filename: 'kb-create-linux-amd64', sha256: 'a'.repeat(64), url: 'https://github.com/kb-labs-team/kb-labs/releases/download/v2.3.4-binaries/kb-create-linux-amd64' },
    { id: 'kb-dev', os: 'windows', arch: 'amd64', filename: 'kb-dev-windows-amd64.exe', sha256: 'b'.repeat(64), url: 'https://github.com/kb-labs-team/kb-labs/releases/download/v2.3.4-binaries/kb-dev-windows-amd64.exe' },
  ] });
});
