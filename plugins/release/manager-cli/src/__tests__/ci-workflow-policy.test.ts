/**
 * Repository policy test (execution plan PR 6): `.github/workflows/**` may
 * never contain a release-domain decision. CI is a delivery executor for a
 * bundle the release plugin already sealed — the moment a workflow YAML can
 * itself choose a version, a package set, or rebuild an index, the "receipt is
 * the single source of truth" guarantee is gone, and no reviewer can be
 * trusted to keep catching that by eye forever.
 *
 * This scans the actual committed YAML on disk rather than trusting a
 * changelog entry, because a policy that can't detect its own regression is
 * decoration, not a gate.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findRepoRoot } from '@kb-labs/sdk';
import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'kb release plan', pattern: /\bkb(?:\s+-s)?\s+release\s+plan\b/ },
  { label: 'kb release build', pattern: /\bkb(?:\s+-s)?\s+release\s+build\b/ },
  { label: 'kb release stage', pattern: /\bkb(?:\s+-s)?\s+release\s+stage\b/ },
  { label: 'kb release version', pattern: /\bkb(?:\s+-s)?\s+release\s+version\b/ },
  { label: 'npm pack', pattern: /\bnpm\s+pack\b/ },
  { label: 'GoReleaser build', pattern: /\bgoreleaser\s+(?:release|build)\b/i },
  { label: 'release-index generation script', pattern: /prepare-release-index|prepare-binary-manifest/ },
];

// A workflow may legitimately *say* "no plan/build/stage" in a comment (this
// file exists, so does release-deliver.yml's own header). Only literal shell
// invocations matter; skip commented-out and prose lines.
function isExecutableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length > 0 && !trimmed.startsWith('#');
}

describe('release workflow policy: .github/workflows must not decide release domain logic', () => {
  it('contains no forbidden release-planning/build/index-generation command', async () => {
    const repoRoot = await findRepoRoot(process.cwd());
    const workflowFiles = globSync('.github/workflows/*.yml', { cwd: repoRoot, absolute: true });
    expect(workflowFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of workflowFiles) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        if (!isExecutableLine(line)) { return; }
        for (const { label, pattern } of FORBIDDEN_PATTERNS) {
          if (pattern.test(line)) {
            violations.push(`${file.replace(`${repoRoot}/`, '')}:${index + 1}: ${label} — ${line.trim()}`);
          }
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('the release delivery workflow exists and calls only the narrow deliver-request command', async () => {
    const repoRoot = await findRepoRoot(process.cwd());
    const deliverYml = readFileSync(join(repoRoot, '.github/workflows/release-deliver.yml'), 'utf8');
    expect(deliverYml).toMatch(/kb release deliver-request\b/);
    // The old two-workflow build+deliver split is gone outright, not renamed —
    // a mention in the file's own explanatory header comment is fine (and
    // expected: it documents what this file replaces), an executable
    // reference (a `uses:`/job dispatch) to either old filename is not.
    const executableReferences = deliverYml
      .split('\n')
      .filter(isExecutableLine)
      .filter(line => /release-build-candidate|release-deliver-candidate/.test(line));
    expect(executableReferences).toEqual([]);
  });

  it('the old build-candidate/deliver-candidate workflows and their dispatch scripts are deleted', async () => {
    const repoRoot = await findRepoRoot(process.cwd());
    const deletedPaths = [
      '.github/workflows/release-build-candidate.yml',
      '.github/workflows/release-deliver-candidate.yml',
      '.kb/workflows/scripts/dispatch-release-candidate.mjs',
      '.kb/workflows/scripts/dispatch-release-delivery.mjs',
      '.kb/workflows/scripts/promote-release-channel.mjs',
    ];
    for (const relativePath of deletedPaths) {
      expect(globSync(relativePath, { cwd: repoRoot }), relativePath).toEqual([]);
    }
  });
});
