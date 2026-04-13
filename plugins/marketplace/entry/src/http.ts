/**
 * HTTP client for marketplace service via Gateway.
 */

import { useEnv } from '@kb-labs/sdk';

const DEFAULT_GATEWAY_URL = 'http://127.0.0.1:4000';
const MARKETPLACE_PREFIX = '/api/v1/marketplace';
const FETCH_TIMEOUT_MS = 30_000;

function getBaseUrl(): string {
  const marketplaceUrl = useEnv('KB_MARKETPLACE_URL');
  if (marketplaceUrl) {
    return `${marketplaceUrl}${MARKETPLACE_PREFIX}`;
  }
  const gateway = useEnv('KB_GATEWAY_URL') ?? DEFAULT_GATEWAY_URL;
  return `${gateway}${MARKETPLACE_PREFIX}`;
}

export async function post<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Marketplace ${path} failed (${res.status}): ${text}`);
    }
    return await res.json() as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Marketplace ${path} timed out — is the marketplace service running? (kb-dev start marketplace)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function patch<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Marketplace ${path} failed (${res.status}): ${text}`);
    }
    return await res.json() as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Marketplace ${path} timed out — is the marketplace service running? (kb-dev start marketplace)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function del<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Marketplace ${path} failed (${res.status}): ${text}`);
    }
    if (res.status === 204) { return undefined as T; }
    return await res.json() as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Marketplace ${path} timed out — is the marketplace service running? (kb-dev start marketplace)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${getBaseUrl()}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {url.searchParams.set(k, v);}
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Marketplace ${path} failed (${res.status}): ${text}`);
    }
    return await res.json() as T;
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`Marketplace ${path} timed out — is the marketplace service running? (kb-dev start marketplace)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
