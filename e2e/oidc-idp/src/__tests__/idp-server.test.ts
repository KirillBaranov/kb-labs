/**
 * Unit tests for the E2E OIDC IdP server.
 *
 * These run the *real* server over loopback HTTP and drive it exactly as the
 * gateway's `oidc` provider would: discovery → authorize → code exchange →
 * ID-token verification. The point is to prove the IdP is genuinely spec
 * compliant before we wire it into the docker E2E stack (where only CI can
 * exercise it end-to-end through a browser).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { createIdpServer, type IdpServerHandle } from '../idp-server.js';

/** Reserve a free TCP port so the issuer string can match the listen URL. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

const CLIENT_ID = 'kb-gateway';
const CLIENT_SECRET = 'super-secret';
const REDIRECT_URI = 'https://kb-cloud.kblabs.ru/api/auth/oauth/corp/callback';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function s256(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

describe('e2e OIDC IdP server', () => {
  let handle: IdpServerHandle;
  let base: string;

  beforeEach(async () => {
    handle = await createIdpServer({
      issuer: 'http://127.0.0.1', // overwritten below once we know the port
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      allowedRedirectPrefixes: ['https://kb-cloud.kblabs.ru/'],
    });
    const port = await handle.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await handle.close();
  });

  // NOTE: the issuer in the discovery doc is whatever we configured (here a
  // placeholder), but the endpoints are reached via `base`. For the parts of
  // the flow that matter to these tests (form, code, token, signature) the
  // hostname of the issuer string is irrelevant; the round-trip below proves
  // the cryptographic + protocol behaviour. Issuer/audience binding is covered
  // explicitly in the "verifies with iss/aud" test by constructing a server
  // whose issuer equals its own base URL.

  it('serves a discovery document with the expected shape', async () => {
    const res = await fetch(`${base}/.well-known/openid-configuration`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as Record<string, unknown>;
    expect(doc.token_endpoint).toBeDefined();
    expect(doc.authorization_endpoint).toBeDefined();
    expect(doc.jwks_uri).toBeDefined();
    expect(doc.response_types_supported).toEqual(['code']);
    expect(doc.id_token_signing_alg_values_supported).toEqual(['RS256']);
    expect(doc.code_challenge_methods_supported).toEqual(['S256']);
  });

  it('publishes a single RS256 signing key via JWKS', async () => {
    const res = await fetch(`${base}/jwks`);
    expect(res.status).toBe(200);
    const { keys } = (await res.json()) as { keys: Array<Record<string, unknown>> };
    expect(keys).toHaveLength(1);
    const jwk = keys[0]!;
    expect(jwk.kty).toBe('RSA');
    expect(jwk.alg).toBe('RS256');
    expect(jwk.use).toBe('sig');
    expect(jwk.kid).toBeTypeOf('string');
    // Public key only — never the private component.
    expect(jwk.d).toBeUndefined();
  });

  it('renders a login form on the first /authorize hop (no email)', async () => {
    const u = new URL(`${base}/authorize`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', CLIENT_ID);
    u.searchParams.set('redirect_uri', REDIRECT_URI);
    u.searchParams.set('scope', 'openid email');
    u.searchParams.set('state', 'xyz');
    u.searchParams.set('nonce', 'n-123');

    const res = await fetch(u, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('id="idp-login"');
    // Hidden fields carry the params forward.
    expect(html).toContain('name="state" value="xyz"');
    expect(html).toContain('name="nonce" value="n-123"');
  });

  it('rejects /authorize with an unknown client_id', async () => {
    const u = new URL(`${base}/authorize`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', 'wrong');
    u.searchParams.set('redirect_uri', REDIRECT_URI);
    const res = await fetch(u, { redirect: 'manual' });
    expect(res.status).toBe(400);
  });

  it('rejects /authorize with a redirect_uri outside the allow-list', async () => {
    const u = new URL(`${base}/authorize`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', CLIENT_ID);
    u.searchParams.set('redirect_uri', 'https://evil.example.com/callback');
    const res = await fetch(u, { redirect: 'manual' });
    expect(res.status).toBe(400);
  });

  /** Drive /authorize with an email → returns 302 with code+state. */
  async function authorizeWithEmail(
    email: string,
    extra: Record<string, string> = {},
  ): Promise<{ code: string; state: string | null }> {
    const u = new URL(`${base}/authorize`);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', CLIENT_ID);
    u.searchParams.set('redirect_uri', REDIRECT_URI);
    u.searchParams.set('scope', 'openid email');
    u.searchParams.set('email', email);
    for (const [k, v] of Object.entries(extra)) {
      u.searchParams.set(k, v);
    }
    const res = await fetch(u, { redirect: 'manual' });
    expect(res.status).toBe(302);
    const loc = res.headers.get('location');
    expect(loc).toBeTruthy();
    const back = new URL(loc!);
    expect(`${back.origin}${back.pathname}`).toBe(REDIRECT_URI);
    return { code: back.searchParams.get('code')!, state: back.searchParams.get('state') };
  }

  async function exchangeCode(
    code: string,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      ...extra,
    });
    return fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'manual',
    });
  }

  it('completes the authorization-code flow and echoes the nonce', async () => {
    const { code, state } = await authorizeWithEmail('Alice@Example.com', {
      state: 'st-1',
      nonce: 'nonce-1',
    });
    expect(state).toBe('st-1');

    const res = await exchangeCode(code);
    expect(res.status).toBe(200);
    const tok = (await res.json()) as { id_token: string; token_type: string; scope: string };
    expect(tok.token_type).toBe('Bearer');

    // Verify the ID token against the published JWKS.
    const jwks = createRemoteJWKSet(new URL(`${base}/jwks`));
    const { payload, protectedHeader } = await jwtVerify(tok.id_token, jwks, {
      audience: CLIENT_ID,
    });
    expect(protectedHeader.alg).toBe('RS256');
    expect(payload.email).toBe('alice@example.com'); // canonicalized
    expect(payload.email_verified).toBe(true);
    expect(payload.nonce).toBe('nonce-1');
    expect(payload.aud).toBe(CLIENT_ID);
    expect(typeof payload.sub).toBe('string');
    expect((payload.sub as string).startsWith('oidc|')).toBe(true);
  });

  it('binds iss/aud so the RP can verify against its configured issuer', async () => {
    // Spin up a server whose issuer equals its own base URL, so a strict
    // `issuer` check in jwtVerify passes — exactly how the gateway verifies in
    // production. We reserve the port first so the issuer string is accurate.
    const port = await freePort();
    const isoIssuer = `http://127.0.0.1:${port}`;
    const h2 = await createIdpServer({
      issuer: isoIssuer,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      allowedRedirectPrefixes: ['https://kb-cloud.kblabs.ru/'],
    });
    await h2.listen(port, '127.0.0.1');
    try {
      // authorize → code
      const au = new URL(`${isoIssuer}/authorize`);
      au.searchParams.set('response_type', 'code');
      au.searchParams.set('client_id', CLIENT_ID);
      au.searchParams.set('redirect_uri', REDIRECT_URI);
      au.searchParams.set('scope', 'openid email');
      au.searchParams.set('email', 'grace@example.com');
      au.searchParams.set('nonce', 'n-iss');
      const authRes = await fetch(au, { redirect: 'manual' });
      expect(authRes.status).toBe(302);
      const code = new URL(authRes.headers.get('location')!).searchParams.get('code')!;

      // code → token
      const tokRes = await fetch(`${isoIssuer}/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }),
      });
      const { id_token } = (await tokRes.json()) as { id_token: string };

      // Strict verification: issuer AND audience must match.
      const jwks = createRemoteJWKSet(new URL(`${isoIssuer}/jwks`));
      const { payload } = await jwtVerify(id_token, jwks, {
        issuer: isoIssuer,
        audience: CLIENT_ID,
      });
      expect(payload.iss).toBe(isoIssuer);
      expect(payload.aud).toBe(CLIENT_ID);

      // A wrong expected issuer must fail.
      await expect(
        jwtVerify(id_token, jwks, { issuer: 'https://other.example.com', audience: CLIENT_ID }),
      ).rejects.toThrow();
    } finally {
      await h2.close();
    }
  });

  it('rejects token exchange with the wrong client_secret (401 invalid_client)', async () => {
    const { code } = await authorizeWithEmail('bob@example.com');
    const res = await exchangeCode(code, { client_secret: 'wrong' });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('invalid_client');
  });

  it('treats authorization codes as single-use', async () => {
    const { code } = await authorizeWithEmail('carol@example.com');
    const first = await exchangeCode(code);
    expect(first.status).toBe(200);
    const second = await exchangeCode(code);
    expect(second.status).toBe(400);
    const body = (await second.json()) as { error: string };
    expect(body.error).toBe('invalid_grant');
  });

  it('rejects token exchange when redirect_uri does not match the code', async () => {
    const { code } = await authorizeWithEmail('dan@example.com');
    const res = await exchangeCode(code, {
      redirect_uri: 'https://kb-cloud.kblabs.ru/api/auth/oauth/other/callback',
    });
    expect(res.status).toBe(400);
  });

  it('enforces PKCE S256 when a code_challenge was supplied', async () => {
    const verifier = base64url(randomBytes(32));
    const challenge = s256(verifier);
    const { code } = await authorizeWithEmail('erin@example.com', {
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    // Wrong verifier → rejected.
    const bad = await exchangeCode(code, { code_verifier: 'not-the-verifier' });
    expect(bad.status).toBe(400);
  });

  it('accepts a correct PKCE verifier', async () => {
    const verifier = base64url(randomBytes(32));
    const challenge = s256(verifier);
    const { code } = await authorizeWithEmail('frank@example.com', {
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    const ok = await exchangeCode(code, { code_verifier: verifier });
    expect(ok.status).toBe(200);
  });

  it('rejects an unknown grant_type', async () => {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    });
    const res = await fetch(`${base}/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    expect(res.status).toBe(400);
  });
});
