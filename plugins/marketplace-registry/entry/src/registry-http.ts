/**
 * HTTP client for KB Labs Registry service.
 * Routes through gateway (/api/v1/registry) by default; falls back to direct
 * KB_REGISTRY_URL if set (prod or local override).
 */

import { useEnv } from '@kb-labs/sdk';

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:4000';
const REGISTRY_GATEWAY_PREFIX = '/api/v1/registry';
const FETCH_TIMEOUT_MS = 60_000;

function getBaseUrl(): string {
  const direct = useEnv('KB_REGISTRY_URL');
  if (direct) {
    return `${direct.replace(/\/$/, '')}/api/v1`;
  }
  const gateway = useEnv('KB_GATEWAY_URL') ?? DEFAULT_GATEWAY_URL;
  return `${gateway.replace(/\/$/, '')}${REGISTRY_GATEWAY_PREFIX}`;
}

function getAuthHeaders(token?: string): Record<string, string> {
  const t = token ?? useEnv('KB_REGISTRY_TOKEN');
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}

export async function registryPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
  token?: string,
): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
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
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const form = new FormData();
    form.append('tarball', new Blob([tarball], { type: 'application/octet-stream' }), 'package.tgz');
    for (const [k, v] of Object.entries(fields)) { form.append(k, v); }

    const handle = authorHandle ?? useEnv('KB_REGISTRY_AUTHOR_HANDLE');
    const handleHeader: Record<string, string> = handle ? { 'X-Author-Handle': handle } : {};

    const res = await fetch(url, {
      method: 'POST',
      headers: { ...getAuthHeaders(token), ...handleHeader },
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
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
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
