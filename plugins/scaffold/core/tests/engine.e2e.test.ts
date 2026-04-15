import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEntity } from '../src/loader/load-entity.js';
import { build } from '../src/engine.js';
import {
  writeFiles,
  inspectTarget,
  formatTree,
} from '../src/writer/write-files.js';
import type { RenderContext } from '@kb-labs/scaffold-contracts';

const here = dirname(fileURLToPath(import.meta.url));
const templatesRoot = resolve(here, '../../entry/templates');

const ctx: RenderContext = {
  name: 'demo',
  scope: '@kb-labs',
  vars: {
    description: 'A demo plugin',
    license: 'MIT',
    mode: 'in-workspace',
  },
  blocks: ['base'],
  mode: 'in-workspace',
  versions: { sdk: '2.18.0', devkit: '2.28.0' },
};

describe('engine e2e: plugin/base block', () => {
  let outDir: string;
  beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'scaffold-e2e-'));
  });

  it('renders base block into a coherent tree', async () => {
    const entity = await loadEntity(templatesRoot, 'plugin');
    const result = await build({
      entity,
      selectedBlockIds: ['base'],
      context: ctx,
    });

    // Written paths should include all three packages + the emitted manifest.
    const paths = result.files.map((f) => f.path).sort();
    expect(paths).toContain('package.json');
    expect(paths).toContain('README.md');
    expect(paths).toContain('packages/demo-contracts/package.json');
    expect(paths).toContain('packages/demo-core/package.json');
    expect(paths).toContain('packages/demo-entry/package.json');
    expect(paths).toContain('packages/demo-core/src/hello.ts');
    expect(paths).toContain('packages/demo-entry/src/commands/hello.ts');
    expect(paths).toContain('packages/demo-entry/src/manifest.ts');

    // No skip-markers left in output.
    for (const f of result.files) {
      expect(f.contents).not.toContain('@@scaffold:skip@@');
    }

    // pnpm-workspace.yaml is always generated (plugins are self-contained workspaces).
    expect(paths).toContain('pnpm-workspace.yaml');

    const collisionsTree = formatTree(result.files);
    expect(collisionsTree).toBeTruthy();

    // The generated manifest.ts must reference the kb.plugin/3 schema.
    const manifestFile = result.files.find(
      (f) => f.path === 'packages/demo-entry/src/manifest.ts',
    );
    expect(manifestFile).toBeDefined();
    expect(manifestFile!.contents).toContain('kb.plugin/3');
    expect(manifestFile!.contents).toContain('combinePermissions');
    expect(manifestFile!.contents).toContain('@kb-labs/sdk');

    // No leaking internal imports anywhere in the generated tree.
    for (const f of result.files) {
      expect(f.contents).not.toMatch(
        /from\s+['"]@kb-labs\/(core-[a-z-]+|platform-[a-z-]+|core-platform)['"]/,
      );
    }
  });

  it('switches to standalone (pnpm-workspace.yaml present, semver deps)', async () => {
    const entity = await loadEntity(templatesRoot, 'plugin');
    const standaloneCtx: RenderContext = {
      ...ctx,
      vars: { ...ctx.vars, mode: 'standalone' },
      mode: 'standalone',
    };
    const result = await build({
      entity,
      selectedBlockIds: ['base'],
      context: standaloneCtx,
    });
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('pnpm-workspace.yaml');

    const entryPkg = result.files.find(
      (f) => f.path === 'packages/demo-entry/package.json',
    )!;
    // External deps use semver, internal deps use workspace:*.
    expect(entryPkg.contents).toContain('"^2.18.0"');
    expect(entryPkg.contents).toContain('"workspace:*"');
  });

  it('composes blocks: base + cli + rest + contracts', async () => {
    const entity = await loadEntity(templatesRoot, 'plugin');
    const result = await build({
      entity,
      selectedBlockIds: ['base', 'cli', 'rest', 'contracts'],
      context: { ...ctx, blocks: ['base', 'cli', 'rest', 'contracts'] },
    });
    const paths = result.files.map((f) => f.path);
    expect(paths).toContain('packages/demo-entry/src/commands/ping.ts');
    expect(paths).toContain('packages/demo-entry/src/rest/hello.ts');
    expect(paths).toContain('packages/demo-contracts/src/events.ts');

    const manifest = result.files.find(
      (f) => f.path === 'packages/demo-entry/src/manifest.ts',
    )!;
    // Both commands present.
    expect(manifest.contents).toContain('"id": "hello"');
    expect(manifest.contents).toContain('"id": "ping"');
    // REST section present.
    expect(manifest.contents).toContain('"basePath": "/demo"');
    expect(manifest.contents).toContain('rest/hello.js');
  });

  it('renders adapter entity: base + provider-example', async () => {
    const entity = await loadEntity(templatesRoot, 'adapter');
    const adapterCtx: RenderContext = {
      name: 'my-llm',
      scope: '@kb-labs',
      vars: { description: 'Demo LLM', license: 'MIT', mode: 'in-workspace' },
      blocks: ['base', 'provider-example'],
      mode: 'in-workspace',
      versions: { sdk: '2.18.0', devkit: '2.28.0' },
    };
    const result = await build({
      entity,
      selectedBlockIds: ['base', 'provider-example'],
      context: adapterCtx,
    });
    const paths = result.files.map((f) => f.path).sort();
    expect(paths).toContain('src/manifest.ts');
    expect(paths).toContain('src/llm.ts');
    expect(paths).toContain('src/index.ts');

    // Adapter tree must NOT contain the plugin-emitted V3 manifest file.
    const emitted = result.files.find(
      (f) => f.path === 'src/manifest.ts' && f.contents.includes('kb.plugin/3'),
    );
    expect(emitted).toBeUndefined();

    // Must only import from @kb-labs/sdk / @kb-labs/sdk/adapters.
    for (const f of result.files) {
      expect(f.contents).not.toMatch(
        /from\s+['"]@kb-labs\/(core-[a-z-]+|platform-[a-z-]+|core-platform)['"]/,
      );
    }
    const llmSrc = result.files.find((f) => f.path === 'src/llm.ts')!;
    expect(llmSrc.contents).toContain("from '@kb-labs/sdk/adapters'");
  });

  it('actually writes the tree to disk', async () => {
    const entity = await loadEntity(templatesRoot, 'plugin');
    const result = await build({
      entity,
      selectedBlockIds: ['base'],
      context: ctx,
    });

    const target = join(outDir, 'demo-write');
    const state = await inspectTarget(target);
    expect(state.exists).toBe(false);

    await writeFiles({ outRoot: target, files: result.files });

    const helloSrc = await readFile(
      join(target, 'packages/demo-core/src/hello.ts'),
      'utf8',
    );
    expect(helloSrc).toContain('Hello,');
    expect(helloSrc).toContain('from demo');
  });
});
