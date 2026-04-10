import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const FORBIDDEN_PATTERNS: Array<[string, RegExp]> = [
  ['IExecutionBackend', /\binterface\s+IExecutionBackend\b/],
  ['ExecutionRequest', /\binterface\s+ExecutionRequest\b/],
  ['ExecutionResult', /\binterface\s+ExecutionResult\b/],
];

function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(fullPath));
      continue;
    }

    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }

    files.push(fullPath);
  }

  return files;
}

describe('plugin-execution execution contracts invariant', () => {
  it('does not define duplicated execution contract interfaces', () => {
    const offenders: string[] = [];
    const files = collectTsFiles(SRC_DIR);

    for (const file of files) {
      const rel = path.relative(SRC_DIR, file);
      const text = fs.readFileSync(file, 'utf8');
      for (const [name, pattern] of FORBIDDEN_PATTERNS) {
        if (pattern.test(text)) {
          offenders.push(`${rel} -> ${name}`);
        }
      }
    }

    expect(offenders, `duplicated execution contracts found:\n${offenders.join('\n')}`).toEqual([]);
  });
});
