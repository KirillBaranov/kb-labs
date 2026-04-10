/**
 * Shared publishing logic with interactive OTP support
 * Used by both `release:run` and `release publish` commands
 */

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as readline from 'node:readline/promises';
import { useLoader } from '@kb-labs/sdk';

export interface PackageToPublish {
  name: string;
  version: string;
  path: string;
}

export interface PublishWithOTPOptions {
  packages: PackageToPublish[];
  dryRun?: boolean;
  otp?: string;
  tag?: string;
  access?: string;
  ui: {
    write?: (text: string) => void;
  };
  logger?: {
    info: (msg: string, meta?: any) => void;
    warn: (msg: string, meta?: any) => void;
    error: (msg: string, meta?: any) => void;
    debug: (msg: string, meta?: any) => void;
  };
}

export interface PublishResult {
  name: string;
  version: string;
  success: boolean;
  error?: string;
}

export interface PublishWithOTPResult {
  results: PublishResult[];
  published: string[];
  failed: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Publish packages with interactive OTP support
 */
export async function publishPackagesWithOTP(
  options: PublishWithOTPOptions
): Promise<PublishWithOTPResult> {
  const { packages, dryRun, tag, access, ui, logger } = options;
  let otp = options.otp;

  const results: PublishResult[] = [];

  // Build version map from all packages in this release for link: → ^version replacement
  const versionMap = new Map(packages.map(p => [p.name, p.version]));

  for (const pkg of packages) {
    logger?.info('Publishing package', { name: pkg.name, version: pkg.version });

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
          } else if (val.startsWith('workspace:')) {
            const planVersion = versionMap.get(depName);
            if (planVersion) {
              deps[depName] = val === 'workspace:*' ? `^${planVersion}` : val.replace('workspace:', '');
              modified = true;
            } else {
              try {
                const repoRoot = join(pkg.path, '..');
                const candidates = readdirSync(repoRoot, { withFileTypes: true })
                  .filter(d => d.isDirectory())
                  .map(d => join(repoRoot, d.name, 'package.json'));
                for (const candidate of candidates) {
                  try {
                    const cPkg = JSON.parse(readFileSync(candidate, 'utf-8'));
                    if (cPkg.name === depName) {
                      deps[depName] = `^${cPkg.version}`;
                      modified = true;
                      break;
                    }
                  } catch { /* skip */ }
                }
              } catch {
                deps[depName] = '*';
                modified = true;
              }
            }
          }
        }
      }

      if (modified) {
        writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n');
        logger?.info(`Replaced link: deps for ${pkg.name}`);
      }

      const loader = useLoader(`Publishing ${pkg.name}@${pkg.version}...`);
      loader.start();

      let attempts = 0;
      const maxAttempts = 3;
      let published = false;

      while (!published && attempts < maxAttempts) {
        attempts++;

        try {
          await publishSinglePackage({
            packagePath: pkg.path,
            otp,
            dryRun,
            tag,
            access,
          });

          published = true;
          results.push({ name: pkg.name, version: pkg.version, success: true });

          const successMsg = dryRun
            ? `Dry-run succeeded for ${pkg.name}@${pkg.version}`
            : `Published ${pkg.name}@${pkg.version}`;

          loader.succeed(successMsg);
          logger?.info('Package published successfully', {
            name: pkg.name,
            version: pkg.version,
            dryRun,
          });
        } catch (error: any) {
          const errorMessage = error.message || String(error);

          // Check if OTP is required
          if (errorMessage.includes('EOTP') || errorMessage.includes('one-time password')) {
            if (attempts < maxAttempts) {
              loader.succeed(`🔐 2FA required for ${pkg.name}`);
              logger?.info('OTP required for publishing', {
                name: pkg.name,
                attempt: attempts,
              });

              const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
              });

              try {
                otp = await rl.question('   Enter OTP code: ');
                rl.close();

                if (!otp || otp.trim().length !== 6) {
                  ui.write?.('   ⚠️  Invalid OTP code (must be 6 digits)\n');
                  logger?.warn('Invalid OTP code provided', { length: otp?.trim().length });
                  otp = undefined;
                  continue;
                }

                loader.update({ text: `Publishing ${pkg.name}@${pkg.version} with OTP...` });
                loader.start();
                logger?.debug('Retrying with OTP');
              } catch (e) {
                rl.close();
                throw e;
              }
            } else {
              loader.fail('Max OTP attempts reached');
              logger?.error('Max OTP attempts reached', {
                name: pkg.name,
                attempts: maxAttempts,
              });
              results.push({
                name: pkg.name,
                version: pkg.version,
                success: false,
                error: 'Max OTP attempts reached',
              });
              break;
            }
          } else {
            loader.fail(`Failed: ${errorMessage}`);
            logger?.error('Package publish failed', {
              name: pkg.name,
              version: pkg.version,
              error: errorMessage,
            });
            results.push({
              name: pkg.name,
              version: pkg.version,
              success: false,
              error: errorMessage,
            });
            break;
          }
        }
      }
    } finally {
      // Always restore original package.json
      if (!restored) {
        writeFileSync(pkgJsonPath, originalPkgJson);
        restored = true;
      }
    }
  }

  // Build result summary
  const published = results
    .filter((r) => r.success)
    .map((r) => `${r.name}@${r.version}`);
  const failed = results
    .filter((r) => !r.success)
    .map((r) => `${r.name}@${r.version}`);
  const errors = results
    .filter((r) => !r.success && r.error)
    .map((r) => `${r.name}: ${r.error}`);

  return {
    results,
    published,
    failed,
    skipped: dryRun ? packages.map((p) => `${p.name}@${p.version} (dry-run)`) : [],
    errors,
  };
}

interface PublishSingleOptions {
  packagePath: string;
  otp?: string;
  dryRun?: boolean;
  tag?: string;
  access?: string;
}

/**
 * Publish a single package using npm CLI
 */
function publishSinglePackage(options: PublishSingleOptions): Promise<void> {
  const { packagePath, otp, dryRun, tag, access } = options;

  return new Promise((resolve, reject) => {
    const args = ['publish'];

    if (dryRun) {
      args.push('--dry-run');
    }

    if (otp) {
      args.push(`--otp=${otp}`);
    }

    if (tag) {
      args.push(`--tag=${tag}`);
    }

    if (access) {
      args.push(`--access=${access}`);
    }

    const child = spawn('npm', args, {
      cwd: packagePath,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const errorOutput = stderr || stdout;
        reject(new Error(errorOutput));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
