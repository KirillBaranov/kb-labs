#!/usr/bin/env node

/**
 * kb-devkit-check-configs
 *
 * Checks all packages for configuration drift from standard templates.
 * Ensures consistency across the entire monorepo.
 *
 * Features:
 * - Detects missing or modified config files
 * - Validates tsup.config.ts structure (nodePreset usage, dts: true, etc.)
 * - Checks for duplicate external/ignores declarations
 * - Auto-fix capability with backup
 * - CI-friendly exit codes
 *
 * Usage:
 *   npx kb-devkit-check-configs                    # Check all packages
 *   npx kb-devkit-check-configs --fix              # Auto-fix issues
 *   npx kb-devkit-check-configs --package=cli-core # Check specific package
 *   npx kb-devkit-check-configs --ci               # CI mode (fail on drift)
 */

import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { glob } from 'glob';
import { createHash } from 'node:crypto';

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

async function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
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

async function checkPackageConfig(pkg, opts) {
  const issues = [];
  const warnings = [];

  // Check all required config files
  for (const [filename, meta] of Object.entries(CONFIG_FILES)) {
    const filePath = join(pkg.path, filename);
    const templatePath = join(TEMPLATES_DIR, meta.template);

    if (!(await exists(filePath))) {
      if (meta.required) {
        issues.push({
          type: 'missing',
          file: filename,
          severity: 'error',
          message: `Missing required config file: ${filename}`,
        });
      }
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const templateContent = await fs.readFile(templatePath, 'utf8');

    // For tsup.config.ts and eslint.config.js, do structural checks
    if (filename === 'tsup.config.ts') {
      await checkTsupConfig(content, filePath, issues, warnings);
    } else if (filename === 'eslint.config.js') {
      await checkEslintConfig(content, filePath, issues, warnings);
    } else {
      // For tsconfig files, check if they match template exactly (ignoring comments/whitespace)
      const contentClean = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();
      const templateClean = templateContent.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '').trim();

      if (contentClean !== templateClean) {
        issues.push({
          type: 'drift',
          file: filename,
          severity: 'error',
          message: `Config file differs from standard template`,
        });
      }
    }
  }

  return { issues, warnings };
}

async function checkTsupConfig(content, filePath, issues, warnings) {
  // Check for any DevKit preset usage
  const hasDevKitPreset =
    content.includes('nodePreset') ||
    content.includes('binPreset') ||
    content.includes('reactPreset') ||
    content.includes('reactLibPreset') ||
    content.includes('reactAppPreset') ||
    content.includes('sdkPreset') ||
    content.includes('dualPreset') ||
    content.includes("from '@kb-labs/devkit/tsup/"); // Generic DevKit import

  if (!hasDevKitPreset) {
    issues.push({
      type: 'no-preset',
      file: 'tsup.config.ts',
      severity: 'error',
      message: 'Not using any DevKit preset',
    });
  }

  // Check for explicit dts: true
  if (!content.includes('dts:')) {
    warnings.push({
      type: 'implicit-dts',
      file: 'tsup.config.ts',
      severity: 'warning',
      message: 'Missing explicit dts: true',
    });
  }

  // Check for dts: false (critical issue)
  if (content.match(/dts:\s*false/)) {
    issues.push({
      type: 'dts-false',
      file: 'tsup.config.ts',
      severity: 'error',
      message: 'Has dts: false - types not being generated!',
    });
  }

  // Check for duplicate external declarations
  const externalMatch = content.match(/external:\s*\[([^\]]+)\]/s);
  if (externalMatch) {
    const externalContent = externalMatch[1];
    // Check if declaring @kb-labs packages (already in preset)
    if (externalContent.includes('@kb-labs/')) {
      warnings.push({
        type: 'redundant-external',
        file: 'tsup.config.ts',
        severity: 'warning',
        message: 'Declares @kb-labs/* packages in external (already in nodePreset)',
      });
    }
  }

  // Check for tsconfig: 'tsconfig.build.json'
  if (!content.includes("tsconfig: 'tsconfig.build.json'") &&
      !content.includes('tsconfig: "tsconfig.build.json"')) {
    warnings.push({
      type: 'wrong-tsconfig',
      file: 'tsup.config.ts',
      severity: 'warning',
      message: 'Should use tsconfig: "tsconfig.build.json"',
    });
  }
}

async function checkEslintConfig(content, filePath, issues, warnings) {
  // Check for any DevKit preset usage (nodePreset or reactPreset)
  const hasDevKitPreset =
    content.includes('nodePreset') ||
    content.includes('reactPreset');

  if (!hasDevKitPreset) {
    issues.push({
      type: 'no-preset',
      file: 'eslint.config.js',
      severity: 'error',
      message: 'Not using any DevKit preset (nodePreset/reactPreset)',
    });
  }

  // Check for duplicate ignores
  const ignoresMatch = content.match(/ignores:\s*\[([^\]]+)\]/s);
  if (ignoresMatch) {
    const ignoresContent = ignoresMatch[1];
    const redundantPatterns = [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.d.ts',
      '**/scripts/**',
    ];

    for (const pattern of redundantPatterns) {
      if (ignoresContent.includes(pattern)) {
        warnings.push({
          type: 'redundant-ignore',
          file: 'eslint.config.js',
          severity: 'warning',
          message: `Redundant ignore pattern: ${pattern} (already in preset)`,
        });
      }
    }
  }
}

async function autoFix(pkg, issues, opts) {
  const fixed = [];

  for (const issue of issues) {
    const filePath = join(pkg.path, issue.file);

    if (issue.type === 'missing') {
      // Copy template
      const templatePath = join(TEMPLATES_DIR, CONFIG_FILES[issue.file].template);
      await fs.copyFile(templatePath, filePath);
      fixed.push({ issue, action: 'created from template' });
      continue;
    }

    if (issue.type === 'dts-false') {
      // Replace dts: false with dts: true
      let content = await fs.readFile(filePath, 'utf8');

      // Create backup
      await fs.writeFile(`${filePath}.backup`, content);

      content = content.replace(/dts:\s*false/, 'dts: true');
      await fs.writeFile(filePath, content);
      fixed.push({ issue, action: 'changed dts: false → dts: true' });
      continue;
    }

    if (issue.type === 'drift' && (issue.file === 'tsconfig.json' || issue.file === 'tsconfig.build.json')) {
      // Replace with template
      const templatePath = join(TEMPLATES_DIR, CONFIG_FILES[issue.file].template);

      // Create backup
      const content = await fs.readFile(filePath, 'utf8');
      await fs.writeFile(`${filePath}.backup`, content);

      await fs.copyFile(templatePath, filePath);
      fixed.push({ issue, action: 'replaced with template (backup created)' });
      continue;
    }
  }

  return fixed;
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
    fix: flags.has('--fix'),
    ci: flags.has('--ci'),
    json: flags.has('--json'),
    verbose: flags.has('--verbose'),
    package: kv.get('--package'),
  };
}

function printHelp() {
  console.log(`
${color('bright', 'kb-devkit-check-configs')}

Check configuration files for drift from standard templates.

${color('blue', 'Usage:')}
  npx kb-devkit-check-configs [options]

${color('blue', 'Options:')}
  --help, -h           Show this help
  --fix                Auto-fix issues (creates backups)
  --ci                 CI mode (fail with exit code 1 on drift)
  --package=NAME       Check specific package only
  --json               Output JSON format
  --verbose            Verbose output

${color('blue', 'Examples:')}
  npx kb-devkit-check-configs
  npx kb-devkit-check-configs --fix
  npx kb-devkit-check-configs --package=@kb-labs/core
  npx kb-devkit-check-configs --ci

${color('blue', 'Checked Files:')}
  ✓ tsup.config.ts      - Build configuration
  ✓ eslint.config.js    - Linting rules
  ✓ tsconfig.json       - TypeScript IDE config
  ✓ tsconfig.build.json - TypeScript build config
`);
}

async function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  console.log(color('bright', '\n🔍 KB Labs Configuration Drift Checker\n'));

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

  const results = [];
  let totalIssues = 0;
  let totalWarnings = 0;
  let totalFixed = 0;

  for (const pkg of packages) {
    const { issues, warnings } = await checkPackageConfig(pkg, opts);

    if (issues.length > 0 || warnings.length > 0) {
      results.push({ pkg, issues, warnings });
      totalIssues += issues.length;
      totalWarnings += warnings.length;
    }

    if (opts.fix && issues.length > 0) {
      const fixed = await autoFix(pkg, issues, opts);
      totalFixed += fixed.length;
    }
  }

  // Print results
  if (totalIssues > 0) {
    console.log(color('red', `🔴 Issues: ${totalIssues} package(s) with errors\n`));
    for (const { pkg, issues } of results) {
      if (issues.length === 0) {continue;}
      console.log(color('yellow', `   ${pkg.name}`));
      for (const issue of issues) {
        console.log(color('gray', `      ${issue.file}`));
        console.log(color('red', `      └─ ${issue.message}`));
      }
      console.log();
    }
  }

  if (totalWarnings > 0) {
    console.log(color('yellow', `⚠️  Warnings: ${totalWarnings} non-critical issues\n`));
    if (opts.verbose) {
      for (const { pkg, warnings } of results) {
        if (warnings.length === 0) {continue;}
        console.log(color('yellow', `   ${pkg.name}`));
        for (const warning of warnings) {
          console.log(color('gray', `      ${warning.file}`));
          console.log(color('yellow', `      └─ ${warning.message}`));
        }
        console.log();
      }
    }
  }

  if (opts.fix && totalFixed > 0) {
    console.log(color('green', `✅ Auto-fixed ${totalFixed} issue(s)`));
    console.log(color('gray', '   Backups created with .backup extension\n'));
  }

  if (totalIssues === 0 && totalWarnings === 0) {
    console.log(color('green', '✅ All configurations are up to date!\n'));
  } else if (!opts.fix) {
    console.log(color('cyan', '\n💡 Run with --fix to automatically fix issues\n'));
  }

  // Exit code
  if (opts.ci && totalIssues > 0) {
    process.exit(1);
  }

  if (totalIssues > 0 && !opts.fix) {
    process.exit(1);
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
