/**
 * @module @kb-labs/core-discovery/marketplace-lock
 * Read / write / validate .kb/marketplace.lock
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MarketplaceLock, MarketplaceEntry, EntityKind, EntitySignature } from './types.js';
import { DiagnosticCollector } from './diagnostics.js';

const LOCK_FILE = '.kb/marketplace.lock';
const SCHEMA_VERSION = 'kb.marketplace/2' as const;

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Load the marketplace lock file from the given workspace root.
 * Returns null if the file does not exist or is invalid.
 */
export async function readMarketplaceLock(
  root: string,
  diag: DiagnosticCollector,
): Promise<MarketplaceLock | null> {
  const lockPath = path.join(root, LOCK_FILE);

  let raw: string;
  try {
    raw = await fs.readFile(lockPath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      diag.info('LOCK_NOT_FOUND', `No marketplace lock file found at ${lockPath}`, {
        filePath: lockPath,
        remediation: 'Run "kb marketplace install <package>" to create one',
      });
      return null;
    }
    diag.error('LOCK_PARSE_ERROR', `Failed to read ${lockPath}: ${(err as Error).message}`, {
      filePath: lockPath,
    });
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    diag.error('LOCK_PARSE_ERROR', `Invalid JSON in ${lockPath}: ${(err as Error).message}`, {
      filePath: lockPath,
      remediation: 'Fix or regenerate the lock file',
    });
    return null;
  }

  if (!isValidLock(parsed)) {
    diag.error('LOCK_SCHEMA_INVALID', `Lock file schema mismatch — expected ${SCHEMA_VERSION}`, {
      filePath: lockPath,
      remediation: 'Delete the lock file and re-install packages via marketplace',
    });
    return null;
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Write the marketplace lock file atomically (tmp → rename).
 */
export async function writeMarketplaceLock(
  root: string,
  lock: MarketplaceLock,
): Promise<void> {
  const lockPath = path.join(root, LOCK_FILE);
  const dir = path.dirname(lockPath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = `${lockPath}.tmp.${randomUUID()}`;
  const content = JSON.stringify(lock, null, 2) + '\n';

  await fs.writeFile(tmpPath, content, 'utf-8');
  await fs.rename(tmpPath, lockPath);
}

// ---------------------------------------------------------------------------
// Mutate
// ---------------------------------------------------------------------------

/**
 * Add or update an entry in the marketplace lock.
 * Preserves the existing `enabled` flag when the entry already exists —
 * re-installing a disabled package must not silently re-enable it.
 */
export async function addToMarketplaceLock(
  root: string,
  packageId: string,
  entry: MarketplaceEntry,
): Promise<MarketplaceLock> {
  const diag = new DiagnosticCollector();
  const existing = await readMarketplaceLock(root, diag) ?? createEmptyLock();
  const existingEntry = existing.installed[packageId];
  existing.installed[packageId] = {
    ...entry,
    // Preserve enabled state from prior install — re-install must not override
    // a user's explicit disable (e.g. parallel test disabling then re-installing).
    enabled: existingEntry?.enabled ?? entry.enabled,
  };
  await writeMarketplaceLock(root, existing);
  return existing;
}

/**
 * Remove an entry from the marketplace lock.
 * Returns true if the entry existed and was removed.
 */
export async function removeFromMarketplaceLock(
  root: string,
  packageId: string,
): Promise<boolean> {
  const diag = new DiagnosticCollector();
  const existing = await readMarketplaceLock(root, diag);
  if (!existing || !(packageId in existing.installed)) {
    return false;
  }
  delete existing.installed[packageId];
  await writeMarketplaceLock(root, existing);
  return true;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Create an empty marketplace lock */
export function createEmptyLock(): MarketplaceLock {
  return { schema: SCHEMA_VERSION, installed: {} };
}

/** Create a marketplace entry */
export function createMarketplaceEntry(opts: {
  version: string;
  integrity: string;
  resolvedPath: string;
  source: 'marketplace' | 'local';
  primaryKind: EntityKind;
  provides: EntityKind[];
  signature?: EntitySignature;
}): MarketplaceEntry {
  return {
    version: opts.version,
    integrity: opts.integrity,
    resolvedPath: opts.resolvedPath,
    installedAt: new Date().toISOString(),
    source: opts.source,
    primaryKind: opts.primaryKind,
    provides: opts.provides,
    enabled: true,
    signature: opts.signature,
  };
}

// ---------------------------------------------------------------------------
// Enable / Disable
// ---------------------------------------------------------------------------

/**
 * Set `enabled` on an entry in the marketplace lock.
 * Returns false if the package is not found in the lock.
 */
async function setPluginEnabled(
  root: string,
  packageId: string,
  enabled: boolean,
): Promise<boolean> {
  const diag = new DiagnosticCollector();
  const existing = await readMarketplaceLock(root, diag);
  if (!existing || !(packageId in existing.installed)) {
    return false;
  }
  existing.installed[packageId]!.enabled = enabled;
  await writeMarketplaceLock(root, existing);
  return true;
}

/**
 * Mark a plugin as enabled in the marketplace lock.
 * Returns false if the package is not installed.
 */
export async function enablePlugin(root: string, packageId: string): Promise<boolean> {
  return setPluginEnabled(root, packageId, true);
}

/**
 * Mark a plugin as disabled in the marketplace lock.
 * Returns false if the package is not installed.
 */
export async function disablePlugin(root: string, packageId: string): Promise<boolean> {
  return setPluginEnabled(root, packageId, false);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidLock(value: unknown): value is MarketplaceLock {
  if (typeof value !== 'object' || value === null) {return false;}
  const obj = value as Record<string, unknown>;
  return (
    obj.schema === SCHEMA_VERSION &&
    typeof obj.installed === 'object' &&
    obj.installed !== null &&
    !Array.isArray(obj.installed)
  );
}
