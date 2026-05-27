import type { APIRequestContext } from '@playwright/test'
import { GATEWAY } from './urls.js'

// E2E machine token — seeded into the gateway cache via GATEWAY_E2E_MACHINE_TOKEN
// env var (set in docker-compose.yml). Has machine:register permission.
// Not a secret; safe to hardcode for E2E.
const E2E_MACHINE_TOKEN =
  process.env['GATEWAY_E2E_MACHINE_TOKEN'] ?? 'e2e-insecure-machine-register-token'

export interface AuthCredentials {
  clientId: string
  clientSecret: string
  hostId: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
}

/** Register a new agent and return its credentials. Each call creates a new agent.
 *  Uses the E2E machine token (MACHINE_REGISTER permission) as Bearer so the
 *  gateway's /auth/register admin-only gate is satisfied in test environments. */
export async function registerAgent(
  request: APIRequestContext,
  name = 'e2e-test-agent',
  namespaceId = 'e2e',
): Promise<AuthCredentials> {
  const res = await request.post(`${GATEWAY}/auth/register`, {
    data: { name, namespaceId, capabilities: [] },
    headers: { Authorization: `Bearer ${E2E_MACHINE_TOKEN}` },
  })
  if (!res.ok()) throw new Error(`register failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

/** Exchange credentials for a JWT access token. */
export async function issueToken(
  request: APIRequestContext,
  creds: Pick<AuthCredentials, 'clientId' | 'clientSecret'>,
): Promise<AuthTokens> {
  const res = await request.post(`${GATEWAY}/auth/token`, {
    data: { clientId: creds.clientId, clientSecret: creds.clientSecret },
  })
  if (!res.ok()) throw new Error(`token failed: ${res.status()} ${await res.text()}`)
  return res.json()
}

/** Register agent and immediately issue a token. Returns the access token string. */
export async function getAccessToken(request: APIRequestContext): Promise<string> {
  const creds = await registerAgent(request)
  const tokens = await issueToken(request, creds)
  return tokens.accessToken
}
