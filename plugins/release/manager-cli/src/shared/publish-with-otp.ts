/**
 * Shared publishing logic with interactive OTP support.
 * Used by both `release:run` and `release publish` commands.
 *
 * Flow:
 *  1. Optimistic parallel publish (fast-path, works when OTP is not required).
 *  2. On EOTP: fall back to sequential publish with interactive OTP prompt.
 *
 * Reliability:
 *  - Already-published versions are treated as success (idempotent re-runs).
 *  - Transient errors (429, ECONNRESET, etc.) are retried with exponential back-off + jitter.
 *  - dep rewriting (workspace:/link: → ^version) is handled by shared dep-rewrite utility.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import * as readline from 'node:readline/promises';
import { useLoader, useEnv } from '@kb-labs/sdk';
import { rewriteWorkspaceDeps } from './dep-rewrite';

export interface PackageToPublish {
  name: string;
  version: string;
  path: string;
}

export interface PublishWithOTPOptions {
  packages: PackageToPublish[];
  packageManager?: 'pnpm' | 'npm' | 'yarn';
  dryRun?: boolean;
  otp?: string;
  tag?: string;
  access?: string;
  ui: {
    write?: (text: string) => void;
  };
  logger?: {
    info: (msg: string, meta?: Record<string, unknown>) => void;
    warn: (msg: string, meta?: Record<string, unknown>) => void;
    error: (msg: string, error?: Error, meta?: Record<string, unknown>) => void;
    debug: (msg: string, meta?: Record<string, unknown>) => void;
  };
}

export interface PublishResult {
  name: string;
  version: string;
  success: boolean;
  alreadyPublished?: boolean;
  error?: string;
}

export interface PublishWithOTPResult {
  results: PublishResult[];
  published: string[];
  alreadyPublished: string[];
  failed: string[];
  skipped: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Retry helpers (shared with publish-programmatic)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 5;
const RETRY_BASE_DELAYS_MS = [10_000, 20_000, 40_000, 80_000, 160_000] as const;

const RETRYABLE_PATTERNS = [
  'E429', '429 Too Many Requests',
  'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN',
  'socket hang up', 'network timeout', 'read ECONNRESET',
];

const ALREADY_PUBLISHED_PATTERNS = [
  'You cannot publish over the previously published versions',
  'cannot publish over the previously published version',
  'EPUBLISHCONFLICT',
];

function isRetryable(msg: string): boolean {
  return RETRYABLE_PATTERNS.some(p => msg.includes(p));
}

function isAlreadyPublished(msg: string): boolean {
  return ALREADY_PUBLISHED_PATTERNS.some(p => msg.includes(p));
}

function retryDelay(attempt: number): number {
  const base = RETRY_BASE_DELAYS_MS[Math.min(attempt, RETRY_BASE_DELAYS_MS.length - 1)]!;
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(base * jitter);
}

// ---------------------------------------------------------------------------
// Low-level spawn
// ---------------------------------------------------------------------------

interface PublishSingleOptions {
  packagePath: string;
  packageManager?: 'pnpm' | 'npm' | 'yarn';
  otp?: string;
  dryRun?: boolean;
  tag?: string;
  access?: string;
}

function publishSinglePackage(options: PublishSingleOptions): Promise<void> {
  const { packagePath, packageManager = 'pnpm', otp, dryRun, tag, access } = options;

  return new Promise((resolve, reject) => {
    const args = ['publish'];

    if (packageManager === 'pnpm') { args.push('--no-git-checks'); }
    if (dryRun)  { args.push('--dry-run'); }
    if (otp)     { args.push(`--otp=${otp}`); }
    if (tag)     { args.push(`--tag=${tag}`); }
    if (access)  { args.push(`--access=${access}`); }

    const child = spawn(packageManager, args, {
      cwd: packagePath,
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: true,
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || stdout || `${packageManager} publish exited with code ${code}`));
      }
    });

    child.on('error', (err: Error) => reject(err));
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Publish packages with interactive OTP support.
 *
 * Tries parallel optimistic publish first. On EOTP, falls back to sequential
 * publish with interactive OTP prompt.
 */
export async function publishPackagesWithOTP(
  options: PublishWithOTPOptions,
): Promise<PublishWithOTPResult> {
  const { packages, packageManager = 'pnpm', dryRun, tag, access, ui, logger } = options;
  let otp = options.otp;

  const results: PublishResult[] = [];
  const versionMap = new Map(packages.map(p => [p.name, p.version]));

  const CONCURRENCY = Number(useEnv('KB_PUBLISH_CONCURRENCY') ?? 4);
  const remaining: PackageToPublish[] = [];
  let otpFailureDetected = false;

  // -------------------------------------------------------------------------
  // Fast-path: parallel optimistic publish (no OTP required)
  // -------------------------------------------------------------------------

  const fastPublishOne = async (pkg: PackageToPublish): Promise<PublishResult | null> => {
    const restore = rewriteWorkspaceDeps(pkg.path, versionMap, packageManager);
    try {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          await publishSinglePackage({ packagePath: pkg.path, packageManager, otp, dryRun, tag, access });
          logger?.info('Published (fast-path)', { name: pkg.name, version: pkg.version });
          return { name: pkg.name, version: pkg.version, success: true };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);

          if (isAlreadyPublished(msg)) {
            logger?.info(`${pkg.name}@${pkg.version} already published — skipping`);
            return { name: pkg.name, version: pkg.version, success: true, alreadyPublished: true };
          }
          if (msg.includes('EOTP') || msg.includes('one-time password')) {
            otpFailureDetected = true;
            return null; // requeue for sequential OTP path
          }
          if (isRetryable(msg) && attempt < MAX_RETRIES) {
            const delay = retryDelay(attempt);
            logger?.warn(
              `Transient error for ${pkg.name} (attempt ${attempt + 1}/${MAX_RETRIES}), ` +
              `retrying in ${(delay / 1000).toFixed(1)}s`,
            );
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
          logger?.error('Publish failed (fast-path)', { name: pkg.name, error: msg });
          return { name: pkg.name, version: pkg.version, success: false, error: msg };
        }
      }
      return {
        name: pkg.name,
        version: pkg.version,
        success: false,
        error: `Publish failed after ${MAX_RETRIES} retries (transient errors)`,
      };
    } finally {
      restore();
    }
  };

  ui.write?.(`  Publishing ${packages.length} package(s) in parallel (concurrency=${CONCURRENCY})...\n`);
  for (let i = 0; i < packages.length; i += CONCURRENCY) {
    const batch = packages.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(fastPublishOne));
    for (let j = 0; j < batch.length; j++) {
      const res = batchResults[j];
      if (res === null || res === undefined) {
        remaining.push(batch[j]!);
      } else {
        results.push(res);
      }
    }
    if (otpFailureDetected) {
      remaining.push(...packages.slice(i + CONCURRENCY));
      break;
    }
  }

  if (remaining.length === 0) {
    return buildResult(results, packages, dryRun);
  }

  // -------------------------------------------------------------------------
  // Sequential OTP path
  // -------------------------------------------------------------------------

  ui.write?.(`  OTP required — falling back to sequential publish for ${remaining.length} package(s)\n`);

  for (const pkg of remaining) {
    logger?.info('Publishing package (sequential)', { name: pkg.name, version: pkg.version });
    const loader = useLoader(`Publishing ${pkg.name}@${pkg.version}...`);
    loader.start();

    const restore = rewriteWorkspaceDeps(pkg.path, versionMap, packageManager);
    try {
      let published = false;
      let otpAttempts = 0;
      const MAX_OTP_ATTEMPTS = 3;

      while (!published && otpAttempts < MAX_OTP_ATTEMPTS) {
        otpAttempts++;
        try {
          await publishSinglePackage({ packagePath: pkg.path, packageManager, otp, dryRun, tag, access });
          published = true;
          results.push({ name: pkg.name, version: pkg.version, success: true });
          loader.succeed(dryRun ? `Dry-run: ${pkg.name}@${pkg.version}` : `Published ${pkg.name}@${pkg.version}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);

          if (isAlreadyPublished(msg)) {
            published = true;
            results.push({ name: pkg.name, version: pkg.version, success: true, alreadyPublished: true });
            loader.succeed(`${pkg.name}@${pkg.version} already published`);
            break;
          }

          if (msg.includes('EOTP') || msg.includes('one-time password')) {
            if (otpAttempts < MAX_OTP_ATTEMPTS) {
              loader.succeed(`🔐 2FA required for ${pkg.name}`);
              const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
              try {
                const entered = await rl.question('   Enter OTP code: ');
                rl.close();
                if (!entered || entered.trim().length !== 6) {
                  ui.write?.('   ⚠️  Invalid OTP (must be 6 digits)\n');
                  otp = undefined;
                } else {
                  otp = entered.trim();
                }
              } catch (e) {
                rl.close();
                throw e;
              }
              loader.update({ text: `Publishing ${pkg.name}@${pkg.version} with OTP...` });
              loader.start();
            } else {
              loader.fail('Max OTP attempts reached');
              results.push({ name: pkg.name, version: pkg.version, success: false, error: 'Max OTP attempts reached' });
              break;
            }
          } else if (isRetryable(msg)) {
            // Single retry with longest back-off for sequential path (blocking spinner context)
            const delay = retryDelay(MAX_RETRIES - 1); // use the longest delay
            loader.update({ text: `Rate limited — waiting ${(delay / 1000).toFixed(0)}s…` });
            loader.start();
            await new Promise(r => setTimeout(r, delay));
            otpAttempts--; // don't count transient error as an OTP attempt
          } else {
            loader.fail(`Failed: ${msg.split('\n')[0]}`);
            results.push({ name: pkg.name, version: pkg.version, success: false, error: msg });
            break;
          }
        }
      }
    } finally {
      restore();
    }
  }

  return buildResult(results, packages, dryRun);
}

function buildResult(
  results: PublishResult[],
  packages: PackageToPublish[],
  dryRun?: boolean,
): PublishWithOTPResult {
  return {
    results,
    published:        results.filter(r => r.success && !r.alreadyPublished).map(r => `${r.name}@${r.version}`),
    alreadyPublished: results.filter(r => r.alreadyPublished).map(r => `${r.name}@${r.version}`),
    failed:           results.filter(r => !r.success).map(r => `${r.name}@${r.version}`),
    skipped:          dryRun ? packages.map(p => `${p.name}@${p.version} (dry-run)`) : [],
    errors:           results.filter(r => !r.success && r.error).map(r => `${r.name}: ${r.error}`),
  };
}
