/**
 * marketplace:scaffold command - Generate plugin template
 */

import { defineSystemCommand, type CommandResult } from '@kb-labs/shared-command-kit';
import { generateExamples } from '../../../utils/generate-examples';
import type { StringFlagSchema } from '@kb-labs/shared-command-kit/flags';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getContextCwd } from '@kb-labs/shared-cli-ui';

type PluginsScaffoldResult = CommandResult & {
  pluginName?: string;
  dir?: string;
  format?: string;
};

type PluginsScaffoldFlags = {
  format: { type: 'string'; description?: string; default?: string; choices?: readonly string[] };
};

export const pluginsScaffold = defineSystemCommand<PluginsScaffoldFlags, PluginsScaffoldResult>({
  name: 'scaffold',
  description: 'Generate a new KB CLI plugin template',
  category: 'marketplace',
  examples: generateExamples('scaffold', 'marketplace', [
    { flags: {} },  // kb marketplace scaffold (requires <name> arg)
    { flags: { format: 'cjs' } },
  ]),
  flags: {
    format: {
      type: 'string',
      description: 'Module format: esm or cjs',
      default: 'esm',
      choices: ['esm', 'cjs'],
    } as Omit<StringFlagSchema, 'name'>,
  },
  analytics: {
    command: 'marketplace:scaffold',
    startEvent: 'MARKETPLACE_SCAFFOLD_STARTED',
    finishEvent: 'MARKETPLACE_SCAFFOLD_FINISHED',
  },
  async handler(ctx, argv, flags) {
    if (argv.length === 0) {
      throw new Error('Please specify a plugin name');
    }

    const pluginName = argv[0];
    if (!pluginName) {
      throw new Error('Please specify a plugin name');
    }

    ctx.platform?.logger?.info('Scaffolding plugin', { pluginName });
    const format = String(flags.format ?? 'esm'); // Type-safe: string
    const isESM = format === 'esm';
    const extension = isESM ? 'ts' : 'ts';
    const moduleType = isESM ? 'module' : 'commonjs';
    const tsupFormat = isESM ? 'esm' : 'cjs';

    const baseDir = getContextCwd(ctx);
    const dir = path.join(baseDir, pluginName);

    // Check if directory exists
    try {
      await fs.access(dir);
      ctx.platform?.logger?.warn('Directory already exists', { dir });
      throw new Error(`Directory ${pluginName} already exists`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      // Good, doesn't exist
    }

    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(path.join(dir, 'src'), { recursive: true });
    await fs.mkdir(path.join(dir, 'src', 'kb'), { recursive: true });
    await fs.mkdir(path.join(dir, 'src', 'commands'), { recursive: true });

    // package.json
    const packageJson = {
      name: `@your-scope/${pluginName}-cli`,
      version: '1.0.0',
      type: moduleType,
      description: `KB Labs CLI plugin: ${pluginName}`,
      keywords: ['kb-cli-plugin'],
      main: `./dist/kb/manifest.js`,
      exports: {
        './kb/manifest': './dist/kb/manifest.js',
      },
      files: ['dist'],
      scripts: {
        build: `tsup src/kb/manifest.ts src/commands/hello.ts --format ${tsupFormat} --dts`,
        dev: `tsup src/kb/manifest.ts src/commands/hello.ts --format ${tsupFormat} --watch`,
      },
      kb: {
        plugin: true,
        manifest: './dist/kb/manifest.js',
      },
      dependencies: {
        '@kb-labs/plugin-manifest': 'workspace:*',
        '@kb-labs/shared-cli-ui': 'workspace:*',
        '@kb-labs/core-types': 'workspace:*',
      },
      devDependencies: {
        tsup: '^8.5.0',
        typescript: '^5.6.3',
      },
    };

    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');

    // tsconfig.json
    const tsconfig = {
      extends: '@kb-labs/devkit/tsconfig/lib.json',
      compilerOptions: {
        outDir: 'dist',
        rootDir: 'src',
      },
      include: ['src/**/*'],
    };

    await fs.writeFile(path.join(dir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2), 'utf8');

    // Manifest file
    const manifestContent = `import type { ManifestV2 } from '@kb-labs/plugin-contracts';

export const manifest: ManifestV2 = {
  schema: 'kb.plugin/2',
  id: '@your-scope/${pluginName}',
  version: '0.1.0',
  display: {
    name: '${pluginName} Plugin',
    description: 'Example KB Labs CLI plugin using manifest v2'
  },
  permissions: {
    fs: {
      mode: 'read',
      allow: ['.']
    },
    env: {
      allow: ['NODE_ENV']
    }
  },
  cli: {
    commands: [
      {
        id: 'hello',
        group: '${pluginName}',
        describe: 'Hello command from ${pluginName}',
        flags: [],
        handler: './commands/hello#run'
      }
    ]
  }
};
`;

    await fs.writeFile(path.join(dir, 'src', 'kb', `manifest.${extension}`), manifestContent, 'utf8');

    // Command implementation with full typing (Level 3 - Recommended)
    const commandContent = `import { defineCommand, type CommandResult } from '@kb-labs/shared-command-kit';

// Define flag types for type safety
type ${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}HelloFlags = {
  json: { type: 'boolean'; description?: string; default?: boolean };
  quiet: { type: 'boolean'; description?: string; default?: boolean };
};

// Define result type for type safety
type ${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}HelloResult = CommandResult & {
  count?: number;
  message?: string;
  timing?: number;
};

export const run = defineCommand<${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}HelloFlags, ${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}HelloResult>({
  name: '${pluginName}:hello',
  flags: {
    json: {
      type: 'boolean',
      description: 'Output as JSON',
      default: false,
    },
    quiet: {
      type: 'boolean',
      description: 'Suppress non-error output',
      default: false,
    },
  },
  async handler(ctx, argv, flags) {
    // Full type safety: flags.json and flags.quiet are properly typed!
    ctx.platform?.logger?.info('${pluginName} hello started');


    // Your command logic here
    const result = { 
      count: 1, 
      message: 'Hello from ${pluginName} plugin!' 
    };

    const duration = ctx.tracker.total();

    ctx.platform?.logger?.info('${pluginName} hello completed', {
      durationMs: duration,
    });

    if (flags.json) {
      ctx.ui.json({ ok: true, ...result, timing: duration });
    } else if (!flags.quiet) {
      const summary = [
        ctx.ui.colors.success('✓ Success'),
        \`Message: \${result.message}\`,
        \`Time: \${ctx.ui.colors.muted(duration + 'ms')}\`,
      ];
      ctx.ui.write(ctx.ui.box('${pluginName} Command', summary));
    }

    return { ok: true, ...result, timing: duration };
  },
});

// Alternative: Level 2 - Partial typing (flags only)
// Remove the result type parameter to use partial typing:
// export const run = defineCommand<${pluginName.charAt(0).toUpperCase() + pluginName.slice(1)}HelloFlags>({ ... });

// Alternative: Level 1 - No typing (minimal)
// Remove both type parameters for quick prototyping:
// export const run = defineCommand({ ... });
`;

    await fs.writeFile(path.join(dir, 'src', 'commands', `hello.${extension}`), commandContent, 'utf8');

    // tsup.config.ts
    const tsupConfig = `import config from "@kb-labs/devkit/tsup/node.js";

export default {
  ...config,
  entry: ['src/kb/manifest.ts', 'src/commands/hello.ts'],
  format: ['${tsupFormat}'],
  dts: true,
};
`;

    await fs.writeFile(path.join(dir, 'tsup.config.ts'), tsupConfig, 'utf8');

    // README.md
    const readme = `# ${pluginName} CLI Plugin

KB Labs CLI plugin for ${pluginName}.

## Installation

\`\`\`bash
pnpm add @your-scope/${pluginName}-cli
\`\`\`

## Usage

\`\`\`bash
kb ${pluginName} hello
\`\`\`

## Development

\`\`\`bash
# Build
pnpm build

# Watch mode
pnpm dev

# Link for local development
kb marketplace link ./${pluginName}
\`\`\`
`;

    await fs.writeFile(path.join(dir, 'README.md'), readme, 'utf8');

    // .gitignore
    const gitignore = `node_modules
dist
*.log
.DS_Store
`;

    await fs.writeFile(path.join(dir, '.gitignore'), gitignore, 'utf8');

    ctx.platform?.logger?.info('Plugin scaffold created', { pluginName, dir });

    return {
      ok: true,
      pluginName,
      dir,
    };
  },
  formatter(result, ctx, _flags) {
    const resultData = result as any;
    const { pluginName, dir } = resultData;

    const sections = [
      {
        items: [
          ctx.ui.colors.bold('Plugin Template Created:'),
          `${ctx.ui.symbols.success} ${ctx.ui.colors.info(dir)}`,
          '',
          ctx.ui.colors.bold('Next Steps:'),
          `  ${ctx.ui.colors.info(`cd ${pluginName}`)}`,
          `  ${ctx.ui.colors.info('pnpm install')}`,
          `  ${ctx.ui.colors.info('pnpm build')}`,
          `  ${ctx.ui.colors.info(`kb marketplace link ./${pluginName}`)}`,
          `  ${ctx.ui.colors.info(`kb ${pluginName} hello`)}`,
          '',
          ctx.ui.colors.muted('See docs/plugin-development.md for more details'),
        ],
      },
    ];

    ctx.ui.success('Plugin Scaffold', { sections });
  },
});

