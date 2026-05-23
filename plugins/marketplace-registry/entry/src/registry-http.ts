/**
 * HTTP client for KB Labs Registry service.
 *
 * Credential provider chain (in priority order):
 *   1. KB_REGISTRY_URL + KB_REGISTRY_TOKEN — explicit registry URL (CI/CD, closed-loop mirror)
 *   2. KB_GATEWAY_URL  + KB_REGISTRY_TOKEN — legacy CI/CD (derives registry URL from gateway)
 *   3. ~/.kb/credentials.json + KB_REGISTRY_URL — credentials file with explicit registry URL override
 *   4. ~/.kb/credentials.json fully — credentials file, derives registry URL from gatewayUrl
 *   5. Error — "Run: kb auth login"
 *
 * KB_REGISTRY_URL decouples the data layer (where the registry lives) from the execution
 * layer (which gateway runs the CLI command). Useful when the registry is behind a different
 * URL than the execution gateway — e.g. closed-loop mirrors or local dev pointing to prod registry.
 *
 * Token auto-refresh: if accessToken is within 60s of expiry, exchanges refreshToken
 * via POST /auth/refresh and overwrites ~/.kb/credentials.json (chmod 600).
 */

import { readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { useEnv } from '@kb-labs/sdk';

const CREDENTIALS_PATH = join(homedir(), '.kb', 'credentials.json');
const REGISTRY_GATEWAY_PREFIX = '/api/v1/registry';
const FETCH_TIMEOUT_MS = 60_000;
const EXPIRY_BUFFER_MS = 60_000;

interface ResolvedAuth {
  token: string;
  baseUrl: string;   // full registry base URL including /api/v1/registry prefix
  handle: string;
}

interface StoredCredentials {
  gatewayUrl: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  handle?: string;
  namespaceId?: string;
}

/**
 * Resolve registry base URL from env vars only (used when a token is passed explicitly).
 * Priority: KB_REGISTRY_URL → KB_GATEWAY_URL → localhost fallback.
 */
function resolveBaseUrlFromEnv(): string {
  const regUrl  = useEnv('KB_REGISTRY_URL');
  const gateway = useEnv('KB_GATEWAY_URL');
  if (regUrl)  { return regUrl.replace(/\/$/, ''); }
  if (gateway) { return `${gateway.replace(/\/$/, '')}${REGISTRY_GATEWAY_PREFIX}`; }
  return `http://127.0.0.1:4000${REGISTRY_GATEWAY_PREFIX}`;
}

async function resolveAuth(): Promise<ResolvedAuth> {
  const envToken   = useEnv('KB_REGISTRY_TOKEN');
  const envRegUrl  = useEnv('KB_REGISTRY_URL');         // explicit registry base URL (data layer)
  const envGateway = useEnv('KB_GATEWAY_URL');           // legacy: derive registry URL from gateway
  const envHandle  = useEnv('KB_REGISTRY_AUTHOR_HANDLE');

  // 1. Explicit registry URL + token (CI/CD, closed-loop mirror)
  if (envToken && envRegUrl) {
    return { token: envToken, baseUrl: envRegUrl.replace(/\/$/, ''), handle: envHandle ?? '' };
  }

  // 2. Legacy: token + gateway URL → derive registry base URL
  if (envToken && envGateway) {
    return {
      token: envToken,
      baseUrl: `${envGateway.replace(/\/$/, '')}${REGISTRY_GATEWAY_PREFIX}`,
      handle: envHandle ?? '',
    };
  }

  // 3–4. ~/.kb/credentials.json
  let creds: StoredCredentials;
  try {
    creds = JSON.parse(await readFile(CREDENTIALS_PATH, 'utf-8')) as StoredCredentials;
  } catch {
    throw new Error(
      'Not authenticated. Run:\n  kb auth create-service-account --gateway-url <url> --name <name> --namespace-id <ns>\n  kb auth login --gateway-url <url> --client-id <id> --client-secret <secret>',
    );
  }

  // Auto-refresh if token is expired or close to expiry
  if (Date.now() >= creds.expiresAt - EXPIRY_BUFFER_MS) {
    const res = await fetch(`${creds.gatewayUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: creds.refreshToken }),
    });
    if (!res.ok) {
      throw new Error('Session expired. Run: kb auth login --gateway-url <url> --client-id <id> --client-secret <secret>');
    }
    const refreshed = await res.json() as { accessToken: string; refreshToken: string; expiresIn: number };
    creds = {
      ...creds,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: Date.now() + refreshed.expiresIn * 1000,
    };
    await writeFile(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf-8');
    await chmod(CREDENTIALS_PATH, 0o600);
  }

  if (!creds.handle) {
    throw new Error(
      'Author handle not set in credentials. Re-run:\n  kb auth login --gateway-url <url> --client-id <id> --client-secret <secret>',
    );
  }

  // 3. credentials + KB_REGISTRY_URL override (execution gateway ≠ registry URL)
  // 4. credentials fully (gatewayUrl used to derive registry base URL)
  const baseUrl = envRegUrl
    ? envRegUrl.replace(/\/$/, '')
    : `${creds.gatewayUrl.replace(/\/$/, '')}${REGISTRY_GATEWAY_PREFIX}`;

  return { token: creds.accessToken, baseUrl, handle: creds.handle };
}

/**
 * Resolve the author handle from the credential provider chain.
 * Used when the handle is needed explicitly (e.g. for URL path construction).
 */
export async function resolveRegistryHandle(): Promise<string> {
  const auth = await resolveAuth();
  return auth.handle;
}

export async function registryPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const auth = token
    ? { token, baseUrl: resolveBaseUrlFromEnv() }
    : await resolveAuth();

  const url = `${auth.baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Registry ${path} failed (${res.status}): ${text}`);
    }
    if (res.status === 204) { return undefined as T; }
    return await res.json() as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Registry request timed out. Is the gateway reachable?');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function registryPostMultipart<T = unknown>(
  path: string,
  tarball: Buffer,
  fields: Record<string, string>,
  token?: string,
  authorHandle?: string,
): Promise<T> {
  const auth = token
    ? {
        token,
        baseUrl: resolveBaseUrlFromEnv(),
        handle: authorHandle ?? useEnv('KB_REGISTRY_AUTHOR_HANDLE') ?? '',
      }
    : await resolveAuth();

  const url = `${auth.baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append('tarball', new Blob([tarball], { type: 'application/octet-stream' }), 'package.tgz');
    for (const [k, v] of Object.entries(fields)) { form.append(k, v); }

    const handleHeader: Record<string, string> = auth.handle ? { 'X-Author-Handle': auth.handle } : {};

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, ...handleHeader },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Registry publish failed (${res.status}): ${text}`);
    }
    return await res.json() as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Registry publish timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function registryPatch<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const auth = token
    ? { token, baseUrl: resolveBaseUrlFromEnv() }
    : await resolveAuth();

  const url = `${auth.baseUrl}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Registry ${path} failed (${res.status}): ${text}`);
    }
    if (res.status === 204) { return undefined as T; }
    return await res.json() as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error('Registry request timed out.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
