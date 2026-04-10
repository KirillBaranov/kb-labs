/**
 * Auth storage — ICache operations for credentials and tokens.
 *
 * Key schema:
 *   auth:client:{clientId}          → ClientRecord  (permanent)
 *   auth:refresh:{tokenHash}        → { hostId }     (TTL 30d)
 *   auth:publickey:{hostId}         → string (base64url X25519 public key)
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
  publicKey?: string;
  createdAt: number;
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

// ── Client CRUD ───────────────────────────────────────────────────────────────

export async function saveClient(cache: ICache, record: ClientRecord): Promise<void> {
  await cache.set(`auth:client:${record.clientId}`, record);
  // Reverse index: hostId → clientId for WS handler lookups
  await cache.set(`auth:hostindex:${record.hostId}`, record.clientId);
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
  namespaceId: string;
  capabilities: string[];
  publicKey?: string;
  secret: string;
}): ClientRecord {
  return {
    clientId: generateClientId(),
    secretHash: hashSecret(opts.secret),
    hostId: generateHostId(),
    namespaceId: opts.namespaceId,
    tier: 'free',
    name: opts.name,
    capabilities: opts.capabilities,
    publicKey: opts.publicKey,
    createdAt: Date.now(),
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
