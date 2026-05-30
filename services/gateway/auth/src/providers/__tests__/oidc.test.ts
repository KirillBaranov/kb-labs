/**
 * Tests for the built-in OIDC redirect provider (ADR-0020, Step 5).
 *
 * The provider speaks OIDC authorization-code: `startAuthorization` builds
 * the upstream authorize URL + a per-attempt `nonce` session;
 * `authenticate` exchanges the code at the token endpoint and verifies the
 * returned ID token (signature, alg allowlist, iss, aud, exp, nonce,
 * email_verified) before surfacing `{ ok, email, externalId }`.
 *
 * Everything is driven against a locally jose-signed ID token and a fake
 * `fetch` (DI) that serves discovery + JWKS + token endpoint — no network,
 * no global mocks. The security cases are the point: alg-confusion,
 * unverified email, wrong issuer/audience, nonce replay, expiry — every
 * one must resolve to `ok:false` (or throw for genuine infra errors), never
 * a silent accept.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SignJWT,
  generateKeyPair,
  exportJWK,
  type KeyLike,
  type JWK,
} from 'jose';
import type { IdentityProviderDeps } from '@kb-labs/core-contracts';
import { createOidcProvider } from '../oidc.js';

const ISSUER = 'https://idp.example.com';
const CLIENT_ID = 'client-abc';
const CLIENT_SECRET = 'top-secret';
const NONCE = 'nonce-123';
const SUB = 'sub-789';
const REDIRECT_URI = 'https://kb-cloud.kblabs.ru/api/auth/oauth/corp/callback';

// ── jose signing fixtures ─────────────────────────────────────────────────────

interface Keys {
  privateKey: KeyLike;
  publicJwk: JWK;
}

async function makeKeys(): Promise<Keys> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-key';
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  return { privateKey, publicJwk };
}

interface IdTokenClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean;
  nonce?: string;
  expSeconds?: number; // seconds from now; negative = expired
}

async function signIdToken(privateKey: KeyLike, claims: IdTokenClaims = {}): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + (claims.expSeconds ?? 300);
  return new SignJWT({
    email: claims.email ?? 'Alice@Example.com',
    email_verified: claims.email_verified ?? true,
    nonce: claims.nonce ?? NONCE,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? CLIENT_ID)
    .setSubject(claims.sub ?? SUB)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
}

// HS256 forgery (alg-confusion): an attacker who learns the public key tries
// to pass it off as an HMAC secret. The alg allowlist must reject this.
async function signHs256(secret: string, claims: IdTokenClaims = {}): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 300;
  return new SignJWT({
    email: claims.email ?? 'alice@example.com',
    email_verified: true,
    nonce: claims.nonce ?? NONCE,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setSubject(SUB)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
}

// ── Fake fetch (DI) ───────────────────────────────────────────────────────────

interface FakeFetchOpts {
  publicJwk: JWK;
  idToken?: string;
  tokenStatus?: number;
}

function makeFetch(opts: FakeFetchOpts): typeof globalThis.fetch {
  const discovery = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/authorize`,
    token_endpoint: `${ISSUER}/token`,
    jwks_uri: `${ISSUER}/jwks`,
  };
  const fn = async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? 'GET';

    if (url.endsWith('/.well-known/openid-configuration')) {
      return new Response(JSON.stringify(discovery), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === discovery.jwks_uri) {
      return new Response(JSON.stringify({ keys: [opts.publicJwk] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url === discovery.token_endpoint && method === 'POST') {
      if (opts.tokenStatus && opts.tokenStatus >= 400) {
        return new Response('upstream error', { status: opts.tokenStatus });
      }
      return new Response(
        JSON.stringify({ id_token: opts.idToken, access_token: 'at-xyz', token_type: 'Bearer' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('not found', { status: 404 });
  };
  return fn as unknown as typeof globalThis.fetch;
}

// ── Deps factory ──────────────────────────────────────────────────────────────

const noopLogger = { warn: () => {}, info: () => {}, error: () => {} };

function makeDeps(fetchFn: typeof globalThis.fetch): IdentityProviderDeps {
  return {
    // Redirect providers never touch the user/credential ports — the gateway
    // does the email→user join after authenticate() returns.
    users: { findByEmailTenant: async () => null },
    credentials: { getCredential: async () => null },
    tenantId: 'kb-cloud',
    bcryptCost: 4,
    logger: noopLogger,
    fetch: fetchFn,
  };
}

const baseConfig = {
  type: 'oidc' as const,
  id: 'corp',
  issuer: ISSUER,
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
};

function callbackInput(code = 'auth-code'): unknown {
  return { code, state: 'state-1', session: { nonce: NONCE }, redirectUri: REDIRECT_URI };
}

describe('createOidcProvider — startAuthorization', () => {
  it('builds the authorize URL and returns a nonce session', async () => {
    const { publicJwk } = await makeKeys();
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk })));
    if (provider.kind !== 'redirect') { throw new Error('expected redirect provider'); }

    const result = await provider.startAuthorization({ state: 'state-1', redirectUri: REDIRECT_URI });
    const url = new URL(result.redirectUrl);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('state')).toBe('state-1');
    const nonce = url.searchParams.get('nonce');
    expect(nonce).toBeTruthy();
    expect((result.session as { nonce?: string }).nonce).toBe(nonce);
  });

  it('adds a PKCE challenge and verifier session when pkce is enabled', async () => {
    const { publicJwk } = await makeKeys();
    const provider = createOidcProvider({ ...baseConfig, pkce: true }, makeDeps(makeFetch({ publicJwk })));
    if (provider.kind !== 'redirect') { throw new Error('expected redirect provider'); }

    const result = await provider.startAuthorization({ state: 's', redirectUri: REDIRECT_URI });
    const url = new URL(result.redirectUrl);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect((result.session as { codeVerifier?: string }).codeVerifier).toBeTruthy();
  });
});

describe('createOidcProvider — authenticate (happy + verification)', () => {
  let keys: Keys;
  beforeEach(async () => { keys = await makeKeys(); });

  it('valid token → ok:true with canonical email + externalId', async () => {
    const idToken = await signIdToken(keys.privateKey);
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk, idToken })));
    const res = await provider.authenticate(callbackInput());
    expect(res).toEqual({ ok: true, email: 'alice@example.com', externalId: SUB });
  });

  it('aud != clientId → ok:false', async () => {
    const idToken = await signIdToken(keys.privateKey, { aud: 'someone-else' });
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk, idToken })));
    const res = await provider.authenticate(callbackInput());
    expect(res.ok).toBe(false);
  });

  it('nonce mismatch → ok:false', async () => {
    const idToken = await signIdToken(keys.privateKey, { nonce: 'a-different-nonce' });
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk, idToken })));
    const res = await provider.authenticate(callbackInput());
    expect(res.ok).toBe(false);
  });

  it('expired token → ok:false', async () => {
    const idToken = await signIdToken(keys.privateKey, { expSeconds: -60 });
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk, idToken })));
    const res = await provider.authenticate(callbackInput());
    expect(res.ok).toBe(false);
  });

  it('wrong issuer → ok:false', async () => {
    const idToken = await signIdToken(keys.privateKey, { iss: 'https://evil.example' });
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk, idToken })));
    const res = await provider.authenticate(callbackInput());
    expect(res.ok).toBe(false);
  });

  it('IdP error param → ok:false without a token exchange', async () => {
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk })));
    const res = await provider.authenticate({ error: 'access_denied', state: 'state-1', session: { nonce: NONCE } });
    expect(res.ok).toBe(false);
  });

  it('token endpoint 5xx → throws (genuine infra error)', async () => {
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk, tokenStatus: 502 })));
    await expect(provider.authenticate(callbackInput())).rejects.toThrow();
  });
});

describe('createOidcProvider — security guarantees', () => {
  let keys: Keys;
  beforeEach(async () => { keys = await makeKeys(); });

  it('HS256-forged token (alg-confusion) → ok:false', async () => {
    // Attacker signs HS256 using the public key material as the secret.
    const forged = await signHs256(JSON.stringify(keys.publicJwk));
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk, idToken: forged })));
    const res = await provider.authenticate(callbackInput());
    expect(res.ok).toBe(false);
  });

  it('email_verified:false → ok:false (no account takeover on unverified email)', async () => {
    const idToken = await signIdToken(keys.privateKey, { email_verified: false });
    const provider = createOidcProvider(baseConfig, makeDeps(makeFetch({ publicJwk: keys.publicJwk, idToken })));
    const res = await provider.authenticate(callbackInput());
    expect(res.ok).toBe(false);
  });

  it('email_verified:false → ok:true when allowUnverifiedEmail is set', async () => {
    const idToken = await signIdToken(keys.privateKey, { email_verified: false });
    const provider = createOidcProvider(
      { ...baseConfig, allowUnverifiedEmail: true },
      makeDeps(makeFetch({ publicJwk: keys.publicJwk, idToken })),
    );
    const res = await provider.authenticate(callbackInput());
    expect(res.ok).toBe(true);
  });

  it('reads clientSecret from env when clientSecretEnv is configured', async () => {
    process.env.TEST_OIDC_SECRET = 'env-secret';
    const idToken = await signIdToken(keys.privateKey);
    let sentSecret: string | undefined;
    const fetchFn = (async (input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit): Promise<Response> => {
      const base = makeFetch({ publicJwk: keys.publicJwk, idToken });
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/token') && init?.body) {
        const params = new URLSearchParams(init.body as string);
        sentSecret = params.get('client_secret') ?? undefined;
      }
      return base(input, init);
    }) as unknown as typeof globalThis.fetch;

    const provider = createOidcProvider(
      { type: 'oidc', id: 'corp', issuer: ISSUER, clientId: CLIENT_ID, clientSecretEnv: 'TEST_OIDC_SECRET' },
      makeDeps(fetchFn),
    );
    const res = await provider.authenticate(callbackInput());
    expect(res.ok).toBe(true);
    expect(sentSecret).toBe('env-secret');
    delete process.env.TEST_OIDC_SECRET;
  });

  it('rejects a non-https issuer at construction', () => {
    expect(() =>
      createOidcProvider({ ...baseConfig, issuer: 'http://insecure.example' }, makeDeps(makeFetch({ publicJwk: keys.publicJwk }))),
    ).toThrow();
  });

  it('throws at construction when no client secret can be resolved', () => {
    expect(() =>
      createOidcProvider(
        { type: 'oidc', id: 'corp', issuer: ISSUER, clientId: CLIENT_ID, clientSecretEnv: 'DOES_NOT_EXIST_ENV' },
        makeDeps(makeFetch({ publicJwk: keys.publicJwk })),
      ),
    ).toThrow();
  });
});
