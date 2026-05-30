/**
 * Auth storage — ICache operations for credentials and tokens.
 *
 * Key schema:
 *   auth:client:{clientId}          → ClientRecord  (permanent)
 *   auth:refresh:{tokenHash}        → { hostId }     (TTL 30d)
 *   auth:publickey:{hostId}         → string (base64url X25519 public key)
 *   auth:handle:{handle}            → clientId       (permanent, handle index)
 */

import { createHash, randomBytes } from 'node:crypto';
import type { ICache } from '@kb-labs/core-platform';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface ClientRecord {
  clientId: string;
  /** bcrypt-style: we store sha256 hash of the secret for simplicity (no bcrypt dep) */
  secretHash: string;
  hostId: string;
  namespaceId: string;
  tier: 'free' | 'pro' | 'enterprise';
  name: string;
  capabilities: string[];
  /** Permissions embedded in issued JWTs. If absent, defaults to ['host:connect']. */
  permissions?: string[];
  publicKey?: string;
  createdAt: number;
  /** Unique human-readable handle for the marketplace (e.g. "kirill"). Immutable once set. */
  handle?: string;
  email?: string;
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateClientId(): string {
  return `clt_${randomBytes(16).toString('hex')}`;
}

export function generateClientSecret(): string {
  return `cs_${randomBytes(32).toString('base64url')}`;
}

export function generateHostId(): string {
  return `host_${randomBytes(12).toString('hex')}`;
}

export function generateNamespaceId(): string {
  return `ns_${randomBytes(16).toString('hex')}`;
}

// ── Client CRUD ───────────────────────────────────────────────────────────────

export async function saveClient(cache: ICache, record: ClientRecord): Promise<void> {
  await cache.set(`auth:client:${record.clientId}`, record);
  await cache.set(`auth:hostindex:${record.hostId}`, record.clientId);
  if (record.handle) {
    await cache.set(`auth:handle:${record.handle}`, record.clientId);
  }
}

export async function isHandleTaken(cache: ICache, handle: string): Promise<boolean> {
  return (await cache.get(`auth:handle:${handle}`)) !== null;
}

export async function getClientByHandle(cache: ICache, handle: string): Promise<ClientRecord | null> {
  const clientId = await cache.get<string>(`auth:handle:${handle}`);
  if (!clientId) { return null; }
  return getClient(cache, clientId);
}

export async function getClientByHostId(cache: ICache, hostId: string): Promise<ClientRecord | null> {
  const clientId = await cache.get<string>(`auth:hostindex:${hostId}`);
  if (!clientId) {return null;}
  return getClient(cache, clientId);
}

export async function getClient(cache: ICache, clientId: string): Promise<ClientRecord | null> {
  return cache.get<ClientRecord>(`auth:client:${clientId}`);
}

export async function verifyClientSecret(
  cache: ICache,
  clientId: string,
  secret: string,
): Promise<ClientRecord | null> {
  const record = await getClient(cache, clientId);
  if (!record) {return null;}
  if (record.secretHash !== hashSecret(secret)) {return null;}
  return record;
}

export function buildClientRecord(opts: {
  name: string;
  capabilities: string[];
  permissions?: string[];
  publicKey?: string;
  secret: string;
  namespaceId?: string;
  handle?: string;
  email?: string;
}): ClientRecord {
  return {
    clientId: generateClientId(),
    secretHash: hashSecret(opts.secret),
    hostId: generateHostId(),
    namespaceId: opts.namespaceId ?? generateNamespaceId(),
    tier: 'free',
    name: opts.name,
    capabilities: opts.capabilities,
    permissions: opts.permissions,
    publicKey: opts.publicKey,
    createdAt: Date.now(),
    handle: opts.handle,
    email: opts.email,
  };
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

export async function saveRefreshToken(
  cache: ICache,
  token: string,
  hostId: string,
  namespaceId: string,
): Promise<void> {
  await cache.set(`auth:refresh:${hashToken(token)}`, { hostId, namespaceId }, REFRESH_TTL_MS);
}

export async function consumeRefreshToken(
  cache: ICache,
  token: string,
): Promise<{ hostId: string; namespaceId: string } | null> {
  const key = `auth:refresh:${hashToken(token)}`;
  const entry = await cache.get<{ hostId: string; namespaceId: string }>(key);
  if (!entry) {return null;}
  // Rotate: delete old token (new one will be issued)
  await cache.delete(key);
  return entry;
}

// ── Public keys (E2E encryption) ──────────────────────────────────────────────

export async function savePublicKey(
  cache: ICache,
  hostId: string,
  publicKey: string,
): Promise<void> {
  await cache.set(`auth:publickey:${hostId}`, publicKey);
}

export async function getPublicKey(
  cache: ICache,
  hostId: string,
): Promise<string | null> {
  return cache.get<string>(`auth:publickey:${hostId}`);
}
