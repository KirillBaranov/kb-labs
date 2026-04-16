import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
import { formatCommandHelp } from '@kb-labs/shared-cli-ui';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = resolve(here, '..', '..', 'templates');

const SCAFFOLD_FLAGS = [
  { name: 'scope', description: 'npm scope, e.g. @my-org' },
  { name: 'blocks', description: 'comma-separated block ids to include' },
  { name: 'out', description: 'custom output directory' },
  { name: 'force', description: 'overwrite existing output directory' },
  { name: 'dry-run', description: 'preview files without writing' },
];

interface ScaffoldFlags {
  blocks?: string;
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

const FALLBACK_VERSIONS = {
  sdk: '2.18.0',
  devkit: '2.28.0',
  commandKit: '2.30.0',
} as const;

async function detectVersions(): Promise<Record<string, string>> {
  const req = createRequire(import.meta.url);
  const readPkg = async (spec: string, fallback: string): Promise<string> => {
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
  const start = Date.now();
  const input = { ...rawInput.flags, argv: rawInput.argv };

  const { entity: entityArg, name: nameArg } = parsePositional(input.argv);

  const available = await listEntities(TEMPLATES_ROOT);
  if (available.length === 0) {
    ctx.ui?.error?.('No scaffold templates found. Reinstall @kb-labs/scaffold.');
    return { exitCode: 1 };
  }

  if (!entityArg) {
    ctx.ui?.write?.(formatCommandHelp({
      title: 'kb scaffold run',
      description: 'Scaffold a new plugin, adapter, or other entity from a template.',
      examples: available.map((e) => `kb scaffold run ${e} my-${e}`),
      flags: SCAFFOLD_FLAGS,
    }) + '\n');
    ctx.ui?.info?.(`Available entities: ${available.join(', ')}`);
    return { exitCode: 1 };
  }

  if (!available.includes(entityArg)) {
    ctx.ui?.error?.(`Unknown entity "${entityArg}". Available: ${available.join(', ')}`);
    return { exitCode: 1 };
  }

  if (!nameArg) {
    ctx.ui?.write?.(formatCommandHelp({
      title: `kb scaffold run ${entityArg} <name>`,
      description: `Scaffold a new ${entityArg}. Provide a name to continue.`,
      examples: [`kb scaffold run ${entityArg} my-${entityArg}`],
      flags: SCAFFOLD_FLAGS,
    }) + '\n');
    return { exitCode: 1 };
  }

  const problem = runValidator('npmName', nameArg);
  if (problem) {
    ctx.ui?.error?.(`Invalid name "${nameArg}": ${problem}`);
    ctx.ui?.info?.('Name must be lowercase, no spaces, valid npm package name.');
    return { exitCode: 1 };
  }

  const entity = await loadEntity(TEMPLATES_ROOT, entityArg);

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

  let selectedBlocks: string[];
  if (input.blocks) {
    selectedBlocks = input.blocks
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    selectedBlocks = entity.defaults?.blocks ?? entity.blocks.map((b) => b.id);
  }

  try {
    resolveBlocks(entity.blocks, selectedBlocks);
  } catch (e) {
    ctx.ui?.error?.((e as Error).message);
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
    name: nameArg,
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
    ctx.ui?.success?.('Dry run complete', {
      title: 'scaffold run — dry run',
      sections: [
        { header: 'Would write to', items: [outRoot] },
        { header: 'Files', items: formatTree(result.files).split('\n').filter(Boolean) },
      ],
    });
    return { exitCode: 0, result: { outRoot, files: result.files.length } };
  }

  if (state.exists && !state.empty) {
    if (input.force) {
      ctx.ui?.warn?.(`--force: overwriting ${outRoot}`);
    } else {
      ctx.ui?.error?.(`Output directory "${outRoot}" already exists and is not empty.`);
      ctx.ui?.info?.('Use --force to overwrite.');
      return { exitCode: 1 };
    }
  }

  await writeFiles({ outRoot, files: result.files, force: input.force });

  const entryPkgDir =
    entityArg === 'plugin'
      ? `${outRoot}/packages/${nameArg}-entry`
      : outRoot;

  const linked = await linkWithMarketplace(entryPkgDir);

  const registrationNote =
    linked === 'ok'
      ? 'Registered in .kb/marketplace.lock'
      : `Not auto-registered — run: kb marketplace plugins link ${entryPkgDir}`;

  const timing = Date.now() - start;

  ctx.ui?.success?.(`Scaffolded ${entityArg} "${nameArg}"`, {
    title: 'scaffold run',
    sections: [
      {
        header: 'Output',
        items: [outRoot],
      },
      {
        header: 'Marketplace',
        items: [registrationNote],
      },
      {
        header: 'Next steps',
        items: [
          `cd ${outRoot}`,
          'pnpm install',
          'pnpm -w build',
          `pnpm kb ${nameArg} hello   # try it`,
          `pnpm kb scaffold doctor --path ${dirname(outRoot)}`,
        ],
      },
    ],
    timing,
  });

  return {
    exitCode: 0,
    result: { outRoot, files: result.files.length },
  };
}

type LinkOutcome = 'ok' | 'no-shell' | 'failed';

/**
 * Register a scaffolded plugin directly in marketplace.lock.
 */
async function linkWithMarketplace(entryPkgDir: string): Promise<LinkOutcome> {
  try {
    const selfPath = fileURLToPath(import.meta.url);
    const nmIdx = selfPath.lastIndexOf('/node_modules/');
    if (nmIdx < 0) return 'failed';
    const platformDir = selfPath.slice(0, nmIdx);

    const lockPath = resolve(platformDir, '.kb', 'marketplace.lock');

    let lock: { schema: string; installed: Record<string, unknown> };
    try {
      lock = JSON.parse(await readFile(lockPath, 'utf8'));
    } catch {
      lock = { schema: 'kb.marketplace/2', installed: {} };
    }

    const pkgJsonPath = resolve(entryPkgDir, 'package.json');
    const pkgRaw = await readFile(pkgJsonPath, 'utf8');
    const pkg = JSON.parse(pkgRaw) as { name?: string; version?: string; kb?: { manifest?: string } };
    if (!pkg.name) return 'failed';

    const hash = createHash('sha256').update(pkgRaw).digest('base64');
    const provides: string[] = ['plugin', 'cli-command'];
    const resolvedPath = relative(platformDir, resolve(entryPkgDir));
    const pluginId = pkg.name.replace(/-entry$/, '');

    lock.installed[pluginId] = {
      version: pkg.version ?? '0.1.0',
      integrity: `sha256-${hash}`,
      resolvedPath: `./${resolvedPath}`,
      installedAt: new Date().toISOString(),
      source: 'local',
      primaryKind: 'plugin',
      provides,
      enabled: true,
    };

    await mkdir(dirname(lockPath), { recursive: true });
    await writeFile(lockPath, JSON.stringify(lock, null, 2));
    return 'ok';
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
