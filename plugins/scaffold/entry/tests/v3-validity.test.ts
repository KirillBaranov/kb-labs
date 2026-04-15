import { describe, it, expect } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEntity, build } from '@kb-labs/scaffold-core';
import {
  isManifestV3,
  validateManifest,
  type ManifestV3,
} from '@kb-labs/plugin-contracts';
import type { RenderContext } from '@kb-labs/scaffold-contracts';

const here = dirname(fileURLToPath(import.meta.url));
const templatesRoot = resolve(here, '..', 'templates');

const baseCtx: RenderContext = {
  name: 'demo',
  scope: '@kb-labs',
  vars: {
    description: 'A demo plugin',
    license: 'MIT',
    mode: 'in-workspace',
  },
  blocks: [],
  mode: 'in-workspace',
  versions: { sdk: '2.18.0', devkit: '2.28.0' },
};

async function buildFor(blocks: string[]) {
  const entity = await loadEntity(templatesRoot, 'plugin');
  return build({
    entity,
    selectedBlockIds: blocks,
    context: { ...baseCtx, blocks },
  });
}

describe('generated plugin manifest passes V3 validation', () => {
  const combos: string[][] = [
    ['base'],
    ['base', 'cli'],
    ['base', 'cli', 'rest'],
    ['base', 'cli', 'contracts'],
    ['base', 'cli', 'rest', 'contracts'],
  ];

  for (const blocks of combos) {
    it(`is V3-valid for: ${blocks.join(' + ')}`, async () => {
      const { manifest } = await buildFor(blocks);

      expect(isManifestV3(manifest)).toBe(true);

      const { valid, errors } = validateManifest(manifest as ManifestV3);
      expect(errors).toEqual([]);
      expect(valid).toBe(true);

      // Every command handler path must be resolvable (start with ./).
      const cmds = (manifest as { cli?: { commands?: Array<{ handler?: string }> } })
        .cli?.commands ?? [];
      for (const cmd of cmds) {
        expect(cmd.handler).toMatch(/^\.\//);
      }
    });
  }
});
