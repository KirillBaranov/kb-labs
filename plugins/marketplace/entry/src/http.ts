/**
 * HTTP client for marketplace service via Gateway.
 */

import { useEnv } from '@kb-labs/sdk';
import { CredentialsManager, SessionManager, resolveLocalGatewayUrl } from '@kb-labs/cli-runtime/gateway';
import type { GatewayCredentials, SessionCredentials } from '@kb-labs/cli-runtime/gateway';

const MARKETPLACE_PREFIX = '/api/v1/marketplace';
const FETCH_TIMEOUT_MS = 30_000;

type AuthState = {
  gatewayUrl: string;
  accessToken: string;
  refresh: () => Promise<AuthState>;
};

async function loadAuth(): Promise<AuthState | null> {
  const sessionManager = new SessionManager();
  const session = await sessionManager.load();
  if (session) {
    const current = sessionManager.isExpired(session) ? await sessionManager.refresh(session) : session;
    return authState(current, () => sessionManager.refresh(current));
  }

  const credentialsManager = new CredentialsManager();
  const credentials = await credentialsManager.load();
  if (!credentials) {
    return null;
  }
  const current = credentialsManager.isExpired(credentials) ? await credentialsManager.refresh(credentials) : credentials;
  return authState(current, () => credentialsManager.refresh(current));
}

function authState(credentials: GatewayCredentials | SessionCredentials, refresh: () => Promise<GatewayCredentials | SessionCredentials>): AuthState {
  return {
    gatewayUrl: credentials.gatewayUrl,
    accessToken: credentials.accessToken,
    refresh: async () => {
      const updated = await refresh();
      return authState(updated, refresh);
    },
  };
}

function getBaseUrl(gatewayUrl?: string): string {
  const marketplaceUrl = useEnv('KB_MARKETPLACE_URL');
  if (marketplaceUrl) {
    return `${marketplaceUrl}${MARKETPLACE_PREFIX}`;
  }
  const gateway = gatewayUrl ?? useEnv('KB_GATEWAY_URL') ?? resolveLocalGatewayUrl();
  return `${gateway}${MARKETPLACE_PREFIX}`;
}

async function request<T>(method: string, path: string, body?: Record<string, unknown>, params?: Record<string, string>): Promise<T> {
  let auth = await loadAuth();
  const url = new URL(`${getBaseUrl(auth?.gatewayUrl)}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) { url.searchParams.set(key, value); }
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {};
      if (body) { headers['Content-Type'] = 'application/json'; }
      if (auth) { headers.Authorization = `Bearer ${auth.accessToken}`; }
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (response.status === 401 && auth && attempt === 0) {
        auth = await auth.refresh();
        continue;
      }
      if (response.status === 401 && !auth) {
        throw new Error('Marketplace authentication is required. Run `kb auth login` or choose local no-auth mode during installation.');
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Marketplace ${path} failed (${response.status}): ${text}`);
      }
      if (response.status === 204) { return undefined as T; }
      return await response.json() as T;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`Marketplace ${path} timed out — is the marketplace service running? (kb-dev start marketplace)`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Marketplace ${path} failed after refreshing authentication`);
}

export async function post<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  return request<T>('POST', path, body);
}

export async function patch<T = unknown>(path: string, body: Record<string, unknown>): Promise<T> {
  return request<T>('PATCH', path, body);
}

export async function del<T = unknown>(path: string, body?: Record<string, unknown>): Promise<T> {
  return request<T>('DELETE', path, body);
}

export async function get<T = unknown>(path: string, params?: Record<string, string>): Promise<T> {
  return request<T>('GET', path, undefined, params);
}
