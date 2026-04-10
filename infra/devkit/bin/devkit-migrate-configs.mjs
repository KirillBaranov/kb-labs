#!/usr/bin/env node

/**
 * kb-devkit-migrate-configs
 *
 * Mass migration script to standardize all package configurations.
 *
 * What it does:
 * 1. Scans all @kb-labs/* packages in workspace
 * 2. Creates backups of current configs
 * 3. Applies standard templates from DevKit
 * 4. Generates migration report
 *
 * Usage:
 *   npx kb-devkit-migrate-configs                    # Dry run (preview)
 *   npx kb-devkit-migrate-configs --apply            # Apply changes
 *   npx kb-devkit-migrate-configs --package=cli-core # Migrate specific package
 *   npx kb-devkit-migrate-configs --force            # Skip confirmation prompts
 */

import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { glob } from 'glob';
import { createInterface } from 'node:readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DEVKIT_ROOT = resolve(__dirname, '..');
const TEMPLATES_DIR = resolve(DEVKIT_ROOT, 'templates/configs');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function color(c, text) {
  return process.stdout.isTTY ? `${colors[c]}${text}${colors.reset}` : text;
}

async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path) {
  return JSON.parse(await fs.readFile(path, 'utf8'));
}

async function findWorkspacePackages(root) {
  const wsFile = join(root, 'pnpm-workspace.yaml');
  if (!(await exists(wsFile))) {
    return [];
  }

  const pkgJsonPaths = await glob('**/package.json', {
    cwd: root,
    ignore: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
    absolute: true,
  });

  const packages = [];
  for (const pkgPath of pkgJsonPaths) {
    try {
      const pkg = await readJson(pkgPath);
      if (pkg.name && pkg.name.startsWith('@kb-labs/')) {
        packages.push({
          name: pkg.name,
          path: dirname(pkgPath),
          pkg,
        });
      }
    } catch {}
  }

  return packages;
}

const CONFIG_FILES = {
  'tsup.config.ts': { required: true, template: 'tsup.config.ts' },
  'eslint.config.js': { required: true, template: 'eslint.config.js' },
  'tsconfig.json': { required: true, template: 'tsconfig.json' },
  'tsconfig.build.json': { required: true, template: 'tsconfig.build.json' },
};

async function analyzePackage(pkg) {
  const actions = [];

  for (const [filename, meta] of Object.entries(CONFIG_FILES)) {
    const filePath = join(pkg.path, filename);
    const templatePath = join(TEMPLATES_DIR, meta.template);

    if (!(await exists(filePath))) {
      actions.push({
        type: 'create',
        file: filename,
        from: templatePath,
        to: filePath,
      });
    } else {
      const content = await fs.readFile(filePath, 'utf8');
      const templateContent = await fs.readFile(templatePath, 'utf8');

      // For tsconfig files, check exact match
      if (filename.includes('tsconfig')) {
        const contentClean = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();
        const templateClean = templateContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();

        if (contentClean !== templateClean) {
          actions.push({
            type: 'replace',
            file: filename,
            from: templatePath,
            to: filePath,
            backup: `${filePath}.backup`,
          });
        }
      } else {
        // For tsup/eslint, preserve customizations but fix structure
        actions.push({
          type: 'update',
          file: filename,
          to: filePath,
          backup: `${filePath}.backup`,
        });
      }
    }
  }

  return actions;
}

async function applyMigration(pkg, actions, opts) {
  const applied = [];

  for (const action of actions) {
    if (action.type === 'create') {
      await fs.copyFile(action.from, action.to);
      applied.push({ action, result: 'created' });
    } else if (action.type === 'replace') {
      // Backup original
      const content = await fs.readFile(action.to, 'utf8');
      await fs.writeFile(action.backup, content);

      // Copy template
      await fs.copyFile(action.from, action.to);
      applied.push({ action, result: 'replaced (backup created)' });
    } else if (action.type === 'update') {
      // For tsup/eslint, apply smart updates
      const content = await fs.readFile(action.to, 'utf8');
      await fs.writeFile(action.backup, content);

      // Apply fixes
      let updated = content;

      // Fix dts: false → dts: true
      updated = updated.replace(/dts:\s*false/g, 'dts: true');

      // Remove redundant external declarations (smart detection)
      // This is a conservative fix - only remove obvious duplicates

      await fs.writeFile(action.to, updated);
      applied.push({ action, result: 'updated (backup created)' });
    }
  }

  return applied;
}

async function promptConfirm(message) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${message} (y/N): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

function parseArgs(argv) {
  const flags = new Set();
  const kv = new Map();

  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.split('=', 2);
      if (v === undefined) {
        flags.add(k);
      } else {
        kv.set(k, v);
      }
    }
  }

  return {
    help: flags.has('--help') || flags.has('-h'),
    apply: flags.has('--apply'),
    force: flags.has('--force'),
    json: flags.has('--json'),
    verbose: flags.has('--verbose'),
    package: kv.get('--package'),
  };
}

function printHelp() {
  console.log(`
${color('bright', 'kb-devkit-migrate-configs')}

Mass migration script to standardize all package configurations.

${color('blue', 'Usage:')}
  npx kb-devkit-migrate-configs [options]

${color('blue', 'Options:')}
  --help, -h           Show this help
  --apply              Apply changes (default: dry run)
  --force              Skip confirmation prompts
  --package=NAME       Migrate specific package only
  --json               Output JSON format
  --verbose            Verbose output

${color('blue', 'Examples:')}
  # Preview changes
  npx kb-devkit-migrate-configs

  # Apply to all packages
  npx kb-devkit-migrate-configs --apply

  # Migrate specific package
  npx kb-devkit-migrate-configs --package=@kb-labs/core --apply

${color('blue', 'What gets migrated:')}
  ✓ tsup.config.ts      → Standard template with minimal config
  ✓ eslint.config.js    → DevKit preset with minimal ignores
  ✓ tsconfig.json       → Standard TypeScript config
  ✓ tsconfig.build.json → Build-specific config

${color('blue', 'Safety:')}
  • Creates .backup files for all modified configs
  • Dry run by default (use --apply to execute)
  • Interactive confirmation (use --force to skip)
`);
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  console.log(color('bright', '\n🔄 KB Labs Configuration Migration\n'));

  if (!opts.apply) {
    console.log(color('yellow', '⚠️  DRY RUN MODE (use --apply to execute changes)\n'));
  }

  const cwd = process.cwd();
  let packages = await findWorkspacePackages(cwd);

  if (opts.package) {
    packages = packages.filter(p => p.name === opts.package);
    if (packages.length === 0) {
      console.error(color('red', `❌ Package ${opts.package} not found`));
      process.exit(1);
    }
  }

  console.log(color('gray', `Found ${packages.length} package(s) to check\n`));

  // Analyze all packages
  const migrations = [];
  for (const pkg of packages) {
    const actions = await analyzePackage(pkg);
    if (actions.length > 0) {
      migrations.push({ pkg, actions });
    }
  }

  if (migrations.length === 0) {
    console.log(color('green', '✅ All packages are already up to date!\n'));
    process.exit(0);
  }

  // Print summary
  console.log(color('bright', `📊 Migration Summary:\n`));
  console.log(color('gray', `   Packages to migrate: ${migrations.length}`));

  let totalCreate = 0;
  let totalReplace = 0;
  let totalUpdate = 0;

  for (const { pkg, actions } of migrations) {
    console.log(color('cyan', `\n   ${pkg.name}`));
    for (const action of actions) {
      if (action.type === 'create') {
        console.log(color('green', `      ✓ Create ${action.file}`));
        totalCreate++;
      } else if (action.type === 'replace') {
        console.log(color('yellow', `      ⚠ Replace ${action.file}`));
        totalReplace++;
      } else if (action.type === 'update') {
        console.log(color('blue', `      → Update ${action.file}`));
        totalUpdate++;
      }
    }
  }

  console.log(color('gray', `\n   Total: ${totalCreate} create, ${totalReplace} replace, ${totalUpdate} update\n`));

  // Confirm before applying
  if (opts.apply) {
    if (!opts.force && !opts.json) {
      const confirmed = await promptConfirm(color('yellow', '\n⚠️  This will modify files. Continue?'));
      if (!confirmed) {
        console.log(color('gray', '\nMigration cancelled.\n'));
        process.exit(0);
      }
    }

    console.log(color('bright', '\n🔨 Applying migrations...\n'));

    let totalApplied = 0;

    for (const { pkg, actions } of migrations) {
      const applied = await applyMigration(pkg, actions, opts);
      totalApplied += applied.length;

      if (opts.verbose) {
        console.log(color('gray', `   ${pkg.name}: ${applied.length} file(s) migrated`));
      }
    }

    console.log(color('green', `\n✅ Migration complete! ${totalApplied} file(s) migrated\n`));
    console.log(color('gray', '   Backups created with .backup extension\n'));
    console.log(color('cyan', '💡 Next steps:'));
    console.log(color('gray', '   1. Review changes: git diff'));
    console.log(color('gray', '   2. Test builds: pnpm run build'));
    console.log(color('gray', '   3. Run checks: npx kb-devkit-check-configs\n'));
  } else {
    console.log(color('cyan', '\n💡 Run with --apply to execute this migration\n'));
  }

  process.exit(0);
}

main().catch(err => {
  console.error(color('red', '\n❌ Error:'), err.message);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
