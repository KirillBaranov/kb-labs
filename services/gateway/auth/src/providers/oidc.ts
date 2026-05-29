/**
 * @module @kb-labs/gateway-auth/providers/oidc
 *
 * Built-in generic OIDC redirect provider (ADR-0020, Step 5).
 *
 * Implements the authorization-code flow against any spec-compliant OIDC
 * IdP (Google / Okta / Auth0 / Keycloak / Azure AD): `startAuthorization`
 * builds the upstream authorize URL plus a per-attempt `nonce` (and optional
 * PKCE `code_verifier`); `authenticate` exchanges the code at the token
 * endpoint and verifies the returned ID token before returning the canonical
 * identity. The gateway then does email→user→session as for any provider.
 *
 * Security guarantees this provider owns (not "quality of a custom" — these
 * are the floor we promise):
 *
 * - **alg allowlist** — `jwtVerify(..., { algorithms: ['RS256','ES256'] })`.
 *   `none` and HS* are rejected (alg-confusion / key-confusion). Same lesson
 *   as pinning HS256 in jwt.ts: never let the token choose its own algorithm
 *   class.
 * - **iss / aud** — verified against the configured issuer and clientId.
 * - **exp / nonce** — exp enforced by jose; nonce must echo the per-attempt
 *   value we stashed in the state session (replay / token-injection guard).
 * - **email_verified === true** — required unless `allowUnverifiedEmail`,
 *   else an IdP that federates unverified emails becomes an account-takeover
 *   vector.
 * - **issuer https-only** — discovery / JWKS targets are admin-controlled but
 *   we still refuse plaintext.
 * - **secret hygiene** — `clientSecret` is read from an env var
 *   (`clientSecretEnv`) by default; nothing secret is ever logged (no code /
 *   id_token / access_token / client_secret in any log line).
 *
 * `fetch` is injected (DD-8) so the whole flow is testable against a locally
 * signed token with a fake transport — no network, no global mocks. JWKS are
 * fetched via the same injected `fetch` and verified with a local JWK set,
 * with a single refetch on key rotation.
 */

import { z } from 'zod';
import {
  jwtVerify,
  createLocalJWKSet,
  type JSONWebKeySet,
  type JWTPayload,
} from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import type {
  IRedirectIdentityProvider,
  IdentityResult,
  IdentityProviderDeps,
  RedirectStartContext,
  RedirectStartResult,
} from '@kb-labs/core-contracts';
import { canonicalizeEmail } from '../users-store.js';

// ── Config schema ───────────────────────────────────────────────────────────

const OidcConfigSchema = z
  .object({
    type: z.literal('oidc'),
    id: z.string().min(1),
    issuer: z
      .string()
      .url()
      .refine((u) => u.startsWith('https://'), { message: 'issuer must be https' }),
    clientId: z.string().min(1),
    /** Direct secret (discouraged — prefer clientSecretEnv). */
    clientSecret: z.string().min(1).optional(),
    /** Name of the env var holding the secret (preferred). */
    clientSecretEnv: z.string().min(1).optional(),
    /** OAuth scopes; `openid` is always included. Default `['openid','email']`. */
    scopes: z.array(z.string()).optional(),
    /** Enable PKCE (S256). */
    pkce: z.boolean().optional(),
    /** Accept tokens whose email_verified is false (default false). */
    allowUnverifiedEmail: z.boolean().optional(),
  })
  .passthrough();

export type OidcProviderConfig = z.infer<typeof OidcConfigSchema>;

// ── Discovery / JWKS ──────────────────────────────────────────────────────────

interface Discovery {
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

const VERIFY_ALGS = ['RS256', 'ES256'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function resolveSecret(config: OidcProviderConfig): string {
  if (config.clientSecretEnv) {
    const fromEnv = process.env[config.clientSecretEnv];
    if (!fromEnv) {
      throw new Error(
        `oidc provider "${config.id}": clientSecretEnv "${config.clientSecretEnv}" is not set`,
      );
    }
    return fromEnv;
  }
  if (config.clientSecret) {
    return config.clientSecret;
  }
  throw new Error(
    `oidc provider "${config.id}": no client secret — set clientSecretEnv (preferred) or clientSecret`,
  );
}

interface CallbackBundle {
  code?: string;
  error?: string;
  session?: { nonce?: string; codeVerifier?: string };
  redirectUri?: string;
}

function asBundle(input: unknown): CallbackBundle {
  return (input && typeof input === 'object' ? input : {}) as CallbackBundle;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createOidcProvider(
  rawConfig: unknown,
  deps: IdentityProviderDeps,
): IRedirectIdentityProvider {
  const config = OidcConfigSchema.parse(rawConfig);
  const secret = resolveSecret(config);
  const scopes = config.scopes && config.scopes.length > 0 ? config.scopes : ['openid', 'email'];
  // `openid` is mandatory for OIDC.
  const scopeParam = [...new Set(['openid', ...scopes])].join(' ');
  const doFetch = deps.fetch ?? globalThis.fetch;

  let discoveryCache: Discovery | null = null;
  let jwksCache: ReturnType<typeof createLocalJWKSet> | null = null;

  async function discover(): Promise<Discovery> {
    if (discoveryCache) {
      return discoveryCache;
    }
    const url = `${config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
    const res = await doFetch(url);
    if (!res.ok) {
      throw new Error(`oidc "${config.id}": discovery failed (${res.status})`);
    }
    const json = (await res.json()) as Discovery;
    discoveryCache = json;
    return json;
  }

  async function getJwks(force = false): Promise<ReturnType<typeof createLocalJWKSet>> {
    if (jwksCache && !force) {
      return jwksCache;
    }
    const { jwks_uri } = await discover();
    const res = await doFetch(jwks_uri);
    if (!res.ok) {
      throw new Error(`oidc "${config.id}": JWKS fetch failed (${res.status})`);
    }
    const jwks = (await res.json()) as JSONWebKeySet;
    jwksCache = createLocalJWKSet(jwks);
    return jwksCache;
  }

  async function verifyIdToken(idToken: string): Promise<JWTPayload> {
    const opts = { algorithms: VERIFY_ALGS, issuer: config.issuer, audience: config.clientId };
    try {
      const { payload } = await jwtVerify(idToken, await getJwks(), opts);
      return payload;
    } catch (err) {
      // A key-rotation miss is the one recoverable case: refetch JWKS once and
      // retry. Any other failure (bad sig, alg, iss, aud, exp) propagates.
      const code = (err as { code?: string }).code;
      if (code === 'ERR_JWKS_NO_MATCHING_KEY') {
        const { payload } = await jwtVerify(idToken, await getJwks(true), opts);
        return payload;
      }
      throw err;
    }
  }

  const provider: IRedirectIdentityProvider = {
    id: config.id,
    kind: 'redirect',

    async startAuthorization(ctx: RedirectStartContext): Promise<RedirectStartResult> {
      const { authorization_endpoint } = await discover();
      const nonce = base64url(randomBytes(16));
      const url = new URL(authorization_endpoint);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('redirect_uri', ctx.redirectUri);
      url.searchParams.set('scope', scopeParam);
      url.searchParams.set('state', ctx.state);
      url.searchParams.set('nonce', nonce);

      const session: Record<string, unknown> = { nonce };

      if (config.pkce) {
        const codeVerifier = base64url(randomBytes(32));
        const challenge = base64url(createHash('sha256').update(codeVerifier).digest());
        url.searchParams.set('code_challenge', challenge);
        url.searchParams.set('code_challenge_method', 'S256');
        session.codeVerifier = codeVerifier;
      }

      return { redirectUrl: url.toString(), session };
    },

    async authenticate(input: unknown): Promise<IdentityResult> {
      const bundle = asBundle(input);

      // The IdP redirected back with an explicit error (consent denied, etc.).
      // Never attempt a token exchange.
      if (bundle.error) {
        return { ok: false, reason: 'invalid' };
      }
      if (!bundle.code || !bundle.redirectUri) {
        return { ok: false, reason: 'invalid' };
      }

      const { token_endpoint } = await discover();

      // Exchange the authorization code for tokens.
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: bundle.code,
        redirect_uri: bundle.redirectUri,
        client_id: config.clientId,
        client_secret: secret,
      });
      if (config.pkce && bundle.session?.codeVerifier) {
        body.set('code_verifier', bundle.session.codeVerifier);
      }

      const tokenRes = await doFetch(token_endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: body.toString(),
      });
      if (!tokenRes.ok) {
        // 4xx/5xx from the token endpoint is a genuine infra/protocol error —
        // surface it so the route returns a 500-class redirect, not a silent
        // "invalid credentials". Status only; never log the response body.
        throw new Error(`oidc "${config.id}": token endpoint error (${tokenRes.status})`);
      }

      const tokenJson = (await tokenRes.json()) as { id_token?: string };
      const idToken = tokenJson.id_token;
      if (!idToken) {
        return { ok: false, reason: 'invalid' };
      }

      let payload: JWTPayload;
      try {
        payload = await verifyIdToken(idToken);
      } catch {
        // Signature / alg / iss / aud / exp failures all collapse to a coarse
        // not-ok (CD-8). No token material is logged.
        return { ok: false, reason: 'invalid' };
      }

      // Nonce binding: the token's nonce must echo what we minted at /start.
      const expectedNonce = bundle.session?.nonce;
      if (!expectedNonce || payload.nonce !== expectedNonce) {
        return { ok: false, reason: 'invalid' };
      }

      const email = typeof payload.email === 'string' ? payload.email : undefined;
      if (!email) {
        return { ok: false, reason: 'invalid' };
      }

      const emailVerified = payload.email_verified === true;
      if (!emailVerified && !config.allowUnverifiedEmail) {
        return { ok: false, reason: 'invalid' };
      }

      return {
        ok: true,
        email: canonicalizeEmail(email),
        externalId: typeof payload.sub === 'string' ? payload.sub : undefined,
      };
    },
  };

  return provider;
}
