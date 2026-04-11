/**
 * Programmatic npm publishing for REST handlers (non-interactive context)
 *
 * Uses `npm publish` CLI via spawn with NODE_AUTH_TOKEN env variable.
 * This is the correct approach for granular access tokens (classic tokens
 * were revoked by npm in December 2025).
 *
 * Token resolution order:
 * 1. options.token (explicit override)
 * 2. NPM_TOKEN env variable
 * 3. NODE_AUTH_TOKEN env variable
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { useLogger } from '@kb-labs/sdk';

export interface PackageToPublish {
  name: string;
  version: string;
  path: string;
}

export interface ProgrammaticPublishOptions {
  packages: PackageToPublish[];
  packageManager?: 'pnpm' | 'npm' | 'yarn';
  dryRun?: boolean;
  otp?: string;
  tag?: string;
  access?: 'public' | 'restricted';
  registry?: string;
  token?: string;
}

export interface PublishResult {
  name: string;
  version: string;
  success: boolean;
  error?: string;
}

export interface ProgrammaticPublishResult {
  results: PublishResult[];
  published: string[];
  failed: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Resolve npm auth token from options or environment
 */
function resolveToken(token?: string): string | undefined {
  return token ?? process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;
}

/**
 * Publish a single package using npm CLI
 * Passes auth token via NODE_AUTH_TOKEN env (recommended for granular tokens)
 */
function publishSinglePackage(options: {
  packagePath: string;
  packageManager: string;
  token: string | undefined;
  otp?: string;
  dryRun?: boolean;
  tag?: string;
  access?: string;
  registry?: string;
}): Promise<void> {
  const { packagePath, packageManager, token, otp, dryRun, tag, access, registry } = options;

  return new Promise((resolve, reject) => {
    const args = ['publish'];

    // pnpm checks git cleanliness before publish, but our pipeline already bumps versions
    // (making the tree dirty) before calling publish — disable this check.
    if (packageManager === 'pnpm') {
      args.push('--no-git-checks');
    }

    if (dryRun) {
      args.push('--dry-run');
    }

    if (tag) {
      args.push(`--tag=${tag}`);
    }

    if (access) {
      args.push(`--access=${access}`);
    }

    if (registry) {
      args.push(`--registry=${registry}`);
    }

    if (otp) {
      args.push(`--otp=${otp}`);
    }

    // Pass token via env — this is the correct way for granular tokens
    const env: NodeJS.ProcessEnv = { ...process.env };
    if (token) {
      env['NODE_AUTH_TOKEN'] = token;
    }

    const child = spawn(packageManager, args, {
      cwd: packagePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || stdout || `${packageManager} publish exited with code ${code}`));
      }
    });

    child.on('error', (err: Error) => {
      reject(err);
    });
  });
}

/**
 * Publish packages programmatically (non-interactive, for REST handlers)
 * Uses npm CLI with NODE_AUTH_TOKEN — works with granular access tokens.
 */
export async function publishPackagesProgrammatic(
  options: ProgrammaticPublishOptions
): Promise<ProgrammaticPublishResult> {
  const { packages, packageManager = 'pnpm', dryRun, otp, tag, access, registry } = options;
  const logger = useLogger();

  const token = resolveToken(options.token);

  if (!token && !dryRun) {
    const error = 'No npm token found. Set NPM_TOKEN (or NODE_AUTH_TOKEN) in environment.';
    logger.error(error);
    return {
      results: [],
      published: [],
      failed: packages.map((p) => `${p.name}@${p.version}`),
      skipped: [],
      errors: [error],
    };
  }

  const results: PublishResult[] = [];

  // Build version map from all packages in this release for link: → ^version replacement
  const versionMap = new Map(packages.map(p => [p.name, p.version]));

  for (const pkg of packages) {
    logger.info(`Publishing ${pkg.name}@${pkg.version}`, { path: pkg.path, dryRun });

    // Replace link: deps with real versions before publish, restore after
    const pkgJsonPath = join(pkg.path, 'package.json');
    const originalPkgJson = readFileSync(pkgJsonPath, 'utf-8');
    let restored = false;

    try {
      const pkgJson = JSON.parse(originalPkgJson);
      let modified = false;

      for (const section of ['dependencies', 'peerDependencies'] as const) {
        const deps = pkgJson[section];
        if (!deps) {continue;}
        for (const [depName, depValue] of Object.entries(deps)) {
          if (typeof depValue !== 'string') {continue;}
          const val = depValue as string;

          if (val.startsWith('link:')) {
            // Cross-repo link: → ^version from plan or linked package.json
            const planVersion = versionMap.get(depName);
            if (planVersion) {
              deps[depName] = `^${planVersion}`;
              modified = true;
            } else {
              try {
                const linkPath = val.replace('link:', '');
                const linkedPkg = JSON.parse(readFileSync(join(pkg.path, linkPath, 'package.json'), 'utf-8'));
                deps[depName] = `^${linkedPkg.version}`;
                modified = true;
              } catch {
                deps[depName] = '*';
                modified = true;
              }
            }
          } else if (val.startsWith('workspace:') && packageManager !== 'pnpm') {
            // workspace:* → ^version only needed for npm/yarn (pnpm publish handles this automatically)
            const planVersion = versionMap.get(depName);
            if (planVersion) {
              deps[depName] = val === 'workspace:*' ? `^${planVersion}` : val.replace('workspace:', '');
              modified = true;
            }
          }
        }
      }

      if (modified) {
        writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
        logger.info(`Replaced link: deps for ${pkg.name}`);
      }

      await publishSinglePackage({
        packagePath: pkg.path,
        packageManager,
        token,
        otp,
        dryRun,
        tag,
        access: access ?? 'public',
        registry,
      });

      results.push({ name: pkg.name, version: pkg.version, success: true });
      logger.info(`Published ${pkg.name}@${pkg.version}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error(`Failed to publish ${pkg.name}@${pkg.version}`, undefined, { error: message });

      results.push({
        name: pkg.name,
        version: pkg.version,
        success: false,
        error: message,
      });
    } finally {
      // Always restore original package.json
      if (!restored) {
        writeFileSync(pkgJsonPath, originalPkgJson);
        restored = true;
      }
    }
  }

  const published = results.filter((r) => r.success).map((r) => `${r.name}@${r.version}`);
  const failed = results.filter((r) => !r.success).map((r) => `${r.name}@${r.version}`);
  const errors = results.filter((r) => !r.success && r.error).map((r) => `${r.name}: ${r.error}`);

  return {
    results,
    published,
    failed,
    skipped: dryRun ? packages.map((p) => `${p.name}@${p.version} (dry-run)`) : [],
    errors,
  };
}
