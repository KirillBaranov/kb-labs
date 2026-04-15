import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  defineCommand,
  type PluginContextV3,
  type CLIInput,
} from '@kb-labs/sdk';
import {
  build,
  inspectTarget,
  formatTree,
  listEntities,
  loadEntity,
  resolveBlocks,
  runValidator,
  writeFiles,
} from '@kb-labs/scaffold-core';
import type {
  RenderContext,
} from '@kb-labs/scaffold-contracts';
import {
  error,
  info,
  outro,
  warn,
} from '../ui/prompt.js';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = resolve(here, '..', '..', 'templates');

interface ScaffoldFlags {
  blocks?: string;
  yes?: boolean;
  force?: boolean;
  'dry-run'?: boolean;
  out?: string;
  scope?: string;
  mode?: string;
}

type ScaffoldResult = {
  exitCode: number;
  result?: { outRoot: string; files: number };
};

async function readVersion(pkgPath: string): Promise<string> {
  try {
    const raw = await readFile(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

// Conservative fallbacks — bumped when we cut a new scaffold release.
const FALLBACK_VERSIONS = {
  sdk: '2.18.0',
  devkit: '2.28.0',
  commandKit: '2.30.0',
} as const;

async function detectVersions(): Promise<Record<string, string>> {
  // Use require.resolve from this module as the anchor. Works under pnpm's
  // virtual store because createRequire follows node's resolution rules.
  const req = createRequire(import.meta.url);
  const readPkg = async (
    spec: string,
    fallback: string,
  ): Promise<string> => {
    try {
      const resolved = req.resolve(spec);
      const v = await readVersion(resolved);
      return v === '0.0.0' ? fallback : v;
    } catch {
      return fallback;
    }
  };
  const [sdk, devkit, commandKit] = await Promise.all([
    readPkg('@kb-labs/sdk/package.json', FALLBACK_VERSIONS.sdk),
    readPkg('@kb-labs/devkit/package.json', FALLBACK_VERSIONS.devkit),
    readPkg('@kb-labs/shared-command-kit/package.json', FALLBACK_VERSIONS.commandKit),
  ]);
  return { sdk, devkit, commandKit };
}

function parsePositional(argv: string[] | undefined): {
  entity?: string;
  name?: string;
} {
  if (!argv || argv.length === 0) return {};
  const positional = argv.filter((a) => !a.startsWith('-'));
  return { entity: positional[0], name: positional[1] };
}

async function runDefault(
  ctx: PluginContextV3,
  rawInput: CLIInput<ScaffoldFlags>,
): Promise<ScaffoldResult> {
  const input = { ...rawInput.flags, argv: rawInput.argv };

  const { entity: entityArg, name: nameArg } = parsePositional(input.argv);

  const available = await listEntities(TEMPLATES_ROOT);
  if (available.length === 0) {
    error(`No entities found in templates root: ${TEMPLATES_ROOT}`);
    return { exitCode: 1 };
  }

  // Resolve entity.
  const entityId = entityArg ?? available[0]!;
  if (!available.includes(entityId)) {
    error(`Unknown entity: ${entityId}. Available: ${available.join(', ')}`);
    return { exitCode: 1 };
  }

  const entity = await loadEntity(TEMPLATES_ROOT, entityId);

  // Resolve name — required positional.
  if (!nameArg) {
    error('Usage: kb scaffold run <entity> <name> [flags]');
    return { exitCode: 1 };
  }
  const problem = runValidator('npmName', nameArg);
  if (problem) {
    error(`Invalid name "${nameArg}": ${problem}`);
    return { exitCode: 1 };
  }
  const name = nameArg;

  // Collect entity-level variables — flags override, then entity defaults.
  const vars: Record<string, unknown> = {};
  for (const v of entity.variables) {
    if (v.name === 'scope' && input.scope !== undefined) {
      vars[v.name] = input.scope;
    } else if (v.name === 'mode' && input.mode !== undefined) {
      vars[v.name] = input.mode;
    } else {
      vars[v.name] = v.default ?? '';
    }
  }

  // Select blocks — flag overrides, then entity defaults.
  let selectedBlocks: string[];
  if (input.blocks) {
    selectedBlocks = input.blocks
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    selectedBlocks = entity.defaults?.blocks ?? entity.blocks.map((b) => b.id);
  }

  // Collect block-specific variables — use defaults.
  try {
    resolveBlocks(entity.blocks, selectedBlocks);
  } catch (e) {
    error((e as Error).message);
    return { exitCode: 1 };
  }
  for (const blockId of selectedBlocks) {
    const block = entity.blocks.find((b) => b.id === blockId);
    for (const v of block?.variables ?? []) {
      vars[v.name] = v.default ?? '';
    }
  }

  const scope = (vars.scope as string) ?? input.scope ?? '';
  const mode = (input.mode ?? (vars.mode as string) ?? 'in-workspace') as
    | 'in-workspace'
    | 'standalone';

  const versions = await detectVersions();

  const context: RenderContext = {
    name,
    scope,
    vars,
    blocks: selectedBlocks,
    mode,
    versions,
  };

  const result = await build({
    entity,
    selectedBlockIds: selectedBlocks,
    context,
  });

  const outRoot = input.out ?? result.outRoot;
  const state = await inspectTarget(outRoot);

  if (input['dry-run']) {
    info(`Would write to: ${outRoot}`);
    info('Tree:');
    info(formatTree(result.files));
    outro('Dry run complete.');
    return { exitCode: 0, result: { outRoot, files: result.files.length } };
  }

  if (state.exists && !state.empty) {
    if (input.force) {
      warn(`--force: overwriting ${outRoot}`);
    } else {
      error(`Target "${outRoot}" is not empty. Use --force to overwrite.`);
      return { exitCode: 1 };
    }
  }

  await writeFiles({ outRoot, files: result.files, force: input.force });

  ctx.ui?.success?.(`Scaffolded ${entityId} "${name}"`);
  info(`Output: ${outRoot}`);

  // The package that carries `"kb": { "manifest": "..." }` is the target
  // marketplace.link needs. For plugin entity → <outRoot>/packages/<name>-entry.
  // For adapter entity → <outRoot> itself.
  const entryPkgDir =
    entityId === 'plugin'
      ? `${outRoot}/packages/${name}-entry`
      : outRoot;

  const linked = await linkWithMarketplace(ctx, entryPkgDir);
  if (linked === 'ok') {
    info('Registered in .kb/marketplace.lock');
  } else if (linked === 'no-shell') {
    warn('Could not auto-register (no shell). Run manually:');
    info(`  kb marketplace plugins link ${entryPkgDir}`);
  } else {
    warn('Auto-register failed — register manually:');
    info(`  kb marketplace plugins link ${entryPkgDir}`);
  }

  info('Next steps:');
  info('  pnpm install');
  info('  pnpm -w build');
  info(`  pnpm kb ${name} hello   # try it`);
  info(`  pnpm kb scaffold doctor --path ${dirname(outRoot)}`);
  outro('Done.');

  return {
    exitCode: 0,
    result: { outRoot, files: result.files.length },
  };
}

type LinkOutcome = 'ok' | 'no-shell' | 'failed';

async function linkWithMarketplace(
  ctx: PluginContextV3,
  entryPkgDir: string,
): Promise<LinkOutcome> {
  const shell = ctx.api?.shell;
  if (!shell?.exec) {
    return 'no-shell';
  }
  try {
    const res = await shell.exec(
      'kb',
      ['marketplace', 'plugins', 'link', entryPkgDir],
      { timeout: 60_000 },
    );
    return res.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  }
}

export default defineCommand({
  id: 'scaffold:run',
  description: 'Scaffold <entity> <name> from blocks',

  handler: {
    execute: runDefault,
  },
});
