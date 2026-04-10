import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('core-contracts layering invariants', () => {
  it('does not import @kb-labs/plugin-contracts', () => {
    const files = fs
      .readdirSync(SRC_DIR)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));

    const offenders: string[] = [];

    for (const file of files) {
      const fullPath = path.join(SRC_DIR, file);
      const text = fs.readFileSync(fullPath, 'utf8');
      if (text.includes('@kb-labs/plugin-contracts')) {
        offenders.push(file);
      }
    }

    expect(offenders, `forbidden plugin-layer imports in: ${offenders.join(', ')}`).toEqual([]);
  });
});
