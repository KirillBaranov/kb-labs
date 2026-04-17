import type { APIRequestContext } from '@playwright/test'
import { GATEWAY } from './urls.js'

export interface AuthCredentials {
  clientId: string
  clientSecret: string
  hostId: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken?: string
}

/** Register a new agent and return its credentials. Each call creates a new agent. */
export async function registerAgent(
  request: APIRequestContext,
  name = 'e2e-test-agent',
): Promise<AuthCredentials> {
  const res = await request.post(`${GATEWAY}/auth/register`, {
    data: {
      name,
      namespaceId: 'e2e',
      capabilities: [],
    },
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
