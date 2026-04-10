/**
 * Gateway auth helpers.
 *
 * Extracted from `infra/kb-labs-gateway/apps/gateway-app/src/__tests__/live-gateway.e2e.test.ts`
 * (`getJwtToken`, `registerHost`) so every e2e test can reuse the same flow.
 *
 * Flow:
 *   1. POST /auth/register { name, namespaceId } -> { clientId, clientSecret, hostId }
 *   2. POST /auth/token { clientId, clientSecret }  -> { accessToken }
 */

import type { HttpClient } from './http-client.js';

export interface AgentCredentials {
  accessToken: string;
  clientId: string;
  hostId: string;
}

export interface HostCredentials {
  hostId: string;
  machineToken: string;
}

export async function registerAgent(
  client: HttpClient,
  opts: { name?: string; namespaceId: string } = { namespaceId: 'e2e-default' },
): Promise<AgentCredentials> {
  const name = opts.name ?? 'e2e-agent';
  const regRes = await client.post<{ clientId: string; clientSecret: string; hostId: string }>(
    '/auth/register',
    { name, namespaceId: opts.namespaceId },
  );
  if (!regRes.ok || !regRes.body) {
    throw new Error(`/auth/register failed: ${regRes.status} ${regRes.text}`);
  }
  const { clientId, clientSecret, hostId } = regRes.body;

  const tokenRes = await client.post<{ accessToken: string }>(
    '/auth/token',
    { clientId, clientSecret },
  );
  if (!tokenRes.ok || !tokenRes.body) {
    throw new Error(`/auth/token failed: ${tokenRes.status} ${tokenRes.text}`);
  }

  return { accessToken: tokenRes.body.accessToken, clientId, hostId };
}

export async function registerHost(
  client: HttpClient,
  opts: {
    name?: string;
    namespaceId: string;
    capabilities?: string[];
    workspacePaths?: string[];
  },
): Promise<HostCredentials> {
  const res = await client.post<HostCredentials>('/hosts/register', {
    name: opts.name ?? 'e2e-host',
    namespaceId: opts.namespaceId,
    capabilities: opts.capabilities ?? ['filesystem'],
    workspacePaths: opts.workspacePaths ?? [],
  });
  if (!res.ok || !res.body) {
    throw new Error(`/hosts/register failed: ${res.status} ${res.text}`);
  }
  return res.body;
}
