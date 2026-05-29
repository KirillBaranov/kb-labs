/**
 * @module @kb-labs/e2e-oidc-idp
 *
 * A small but spec-compliant OpenID Connect identity provider, used as the
 * upstream IdP in the gateway auth E2E suite.
 *
 * It is deliberately a *real* OIDC server — discovery document, JWKS endpoint,
 * authorization-code flow with a login form, RS256-signed ID tokens with
 * `nonce`/`aud`/`iss`/`exp`, and PKCE (S256) support. The gateway's built-in
 * `oidc` provider talks to it exactly as it would to Google / Okta / Auth0 /
 * Keycloak in production: discovery → authorize redirect → code exchange →
 * ID-token verification. Nothing about the flow is faked or short-circuited,
 * so the E2E proves the real code path rather than a stub of it.
 *
 * The only test-shaped affordance is the login form: instead of a password
 * database it accepts whatever email the operator types and asserts it as a
 * verified identity. That mirrors a real IdP's "user authenticated" outcome
 * while letting the test drive *which* user logs in (the gateway then maps
 * that email onto an existing active user — there is no JIT provisioning).
 *
 * Security-relevant behaviour it enforces (so the gateway's guarantees are
 * actually exercised, not assumed):
 *   - `client_id` / `client_secret` are validated at the token endpoint.
 *   - `redirect_uri` at /token must match the one bound to the code.
 *   - PKCE: when a `code_challenge` was sent to /authorize, /token requires a
 *     matching `code_verifier` (S256).
 *   - Authorization codes are single-use (consumed on exchange).
 *   - ID tokens are RS256-signed; the alg is fixed (never `none`).
 */

import {
  createServer as createHttpServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type KeyLike } from 'jose';

// ── Public types ──────────────────────────────────────────────────────────────

export interface IdpTlsOptions {
  /** PEM-encoded private key. */
  key: string | Buffer;
  /** PEM-encoded certificate (chain). */
  cert: string | Buffer;
}

export interface IdpServerOptions {
  /**
   * The issuer identifier. MUST be the value the relying party (gateway) has
   * configured, because it is both the discovery base and the `iss` claim.
   * In the docker stack this is the gateway-reachable name, e.g.
   * `https://idp-stub:9443`.
   */
  issuer: string;
  /**
   * Browser-facing authorization endpoint. Defaults to `${issuer}/authorize`.
   * Override when the browser reaches the IdP under a different hostname than
   * the gateway does (split-horizon DNS in the E2E network).
   */
  authorizationEndpoint?: string;
  /** Registered OAuth client id. */
  clientId: string;
  /** Registered OAuth client secret. */
  clientSecret: string;
  /**
   * Optional allow-list of redirect_uri prefixes. When set, /authorize and
   * /token reject any redirect_uri that does not start with one of them —
   * the same open-redirect hygiene a real IdP enforces.
   */
  allowedRedirectPrefixes?: string[];
  /**
   * Fixed signing keypair (JWK pair) for deterministic runs. When omitted an
   * ephemeral RS256 keypair is generated on start and published via JWKS.
   */
  signingKey?: { privateJwk: JWK; publicJwk: JWK; kid: string };
  /** ID-token lifetime in seconds. Default 300. */
  idTokenTtlSec?: number;
  /** Optional TLS — when present the IdP serves https (prod-faithful issuer). */
  tls?: IdpTlsOptions;
}

export interface IdpServerHandle {
  /** The underlying node server (http or https). */
  server: Server;
  /** Bound port (after listen). */
  readonly port: number;
  /** Start listening. Resolves once bound. */
  listen(port?: number, host?: string): Promise<number>;
  /** Stop listening. */
  close(): Promise<void>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function s256(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest());
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A pending authorization: everything bound to an issued code. */
interface PendingCode {
  email: string;
  sub: string;
  nonce?: string;
  redirectUri: string;
  codeChallenge?: string;
}

// ── Factory ─────────────────────────────────────────────────────────────────

/**
 * Build (but do not start) an OIDC IdP. Call `listen()` to bind.
 *
 * Async because it may need to generate a signing keypair.
 */
export async function createIdpServer(options: IdpServerOptions): Promise<IdpServerHandle> {
  const issuer = options.issuer.replace(/\/$/, '');
  const authorizationEndpoint = options.authorizationEndpoint ?? `${issuer}/authorize`;
  const tokenEndpoint = `${issuer}/token`;
  const jwksUri = `${issuer}/jwks`;
  const idTokenTtlSec = options.idTokenTtlSec ?? 300;

  // Signing material.
  let privateKey: KeyLike | Uint8Array;
  let publicJwk: JWK;
  let kid: string;
  if (options.signingKey) {
    const { importJWK } = await import('jose');
    privateKey = (await importJWK(options.signingKey.privateJwk, 'RS256')) as KeyLike;
    publicJwk = { ...options.signingKey.publicJwk, kid: options.signingKey.kid, alg: 'RS256', use: 'sig' };
    kid = options.signingKey.kid;
  } else {
    const { privateKey: priv, publicKey: pub } = await generateKeyPair('RS256', { extractable: true });
    privateKey = priv;
    kid = base64url(randomBytes(8));
    publicJwk = { ...(await exportJWK(pub)), kid, alg: 'RS256', use: 'sig' };
  }

  const codes = new Map<string, PendingCode>();

  function redirectAllowed(uri: string): boolean {
    if (!options.allowedRedirectPrefixes || options.allowedRedirectPrefixes.length === 0) {
      return true;
    }
    return options.allowedRedirectPrefixes.some((p) => uri.startsWith(p));
  }

  function discovery(): Record<string, unknown> {
    return {
      issuer,
      authorization_endpoint: authorizationEndpoint,
      token_endpoint: tokenEndpoint,
      jwks_uri: jwksUri,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'email', 'profile'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
      code_challenge_methods_supported: ['S256'],
      claims_supported: ['sub', 'email', 'email_verified', 'nonce', 'aud', 'iss', 'exp', 'iat'],
    };
  }

  function renderLoginForm(params: URLSearchParams): string {
    // Carry every authorize parameter forward as hidden fields so submitting
    // the form re-enters /authorize with the chosen email added.
    const carry = ['response_type', 'client_id', 'redirect_uri', 'scope', 'state', 'nonce', 'code_challenge', 'code_challenge_method'];
    const hidden = carry
      .map((k) => {
        const v = params.get(k);
        return v == null ? '' : `<input type="hidden" name="${k}" value="${htmlEscape(v)}">`;
      })
      .join('\n      ');
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>E2E OIDC IdP — Sign in</title></head>
<body>
  <h1>E2E OIDC IdP</h1>
  <form id="idp-login" method="GET" action="/authorize">
      ${hidden}
      <label for="idp-email">Email</label>
      <input id="idp-email" name="email" type="email" required autocomplete="email">
      <button id="idp-submit" type="submit">Sign in</button>
  </form>
</body>
</html>`;
  }

  async function mintIdToken(pending: PendingCode): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jwt = new SignJWT({
      email: pending.email,
      email_verified: true,
      nonce: pending.nonce,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(issuer)
      .setSubject(pending.sub)
      .setAudience(options.clientId)
      .setIssuedAt(now)
      .setExpirationTime(now + idTokenTtlSec);
    return jwt.sign(privateKey);
  }

  function send(res: ServerResponse, status: number, contentType: string, body: string): void {
    res.writeHead(status, { 'content-type': contentType, 'cache-control': 'no-store' });
    res.end(body);
  }

  function sendJson(res: ServerResponse, status: number, obj: unknown): void {
    send(res, status, 'application/json', JSON.stringify(obj));
  }

  async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  // ── /authorize ────────────────────────────────────────────────────────────
  // GET: validates client_id/response_type/redirect_uri; first hop renders the
  // login form, the form submit issues a code bound to the attempt and 302s back.
  function handleAuthorize(url: URL, res: ServerResponse): void {
    const q = url.searchParams;
    if (q.get('client_id') !== options.clientId) {
      sendJson(res, 400, { error: 'unauthorized_client' });
      return;
    }
    if (q.get('response_type') !== 'code') {
      sendJson(res, 400, { error: 'unsupported_response_type' });
      return;
    }
    const redirectUri = q.get('redirect_uri');
    if (!redirectUri || !redirectAllowed(redirectUri)) {
      sendJson(res, 400, { error: 'invalid_request', error_description: 'redirect_uri not allowed' });
      return;
    }

    const email = q.get('email');
    if (!email) {
      // First hop: show the login form.
      send(res, 200, 'text/html', renderLoginForm(q));
      return;
    }

    // Form submitted → issue an authorization code bound to this attempt.
    const code = base64url(randomBytes(24));
    codes.set(code, {
      email: email.trim().toLowerCase(),
      // Stable, opaque subject derived from the email (a real IdP's `sub`
      // is an opaque per-user id, not the email).
      sub: `oidc|${base64url(createHash('sha256').update(email.trim().toLowerCase()).digest()).slice(0, 24)}`,
      nonce: q.get('nonce') ?? undefined,
      redirectUri,
      codeChallenge: q.get('code_challenge') ?? undefined,
    });

    const back = new URL(redirectUri);
    back.searchParams.set('code', code);
    const state = q.get('state');
    if (state) {
      back.searchParams.set('state', state);
    }
    res.writeHead(302, { location: back.toString(), 'cache-control': 'no-store' });
    res.end();
  }

  // ── /token ──────────────────────────────────────────────────────────────────
  // POST: authenticates the client, consumes the single-use code, enforces
  // redirect_uri match + PKCE, then mints the RS256 ID token.
  async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const raw = await readBody(req);
    const form = new URLSearchParams(raw);

    if (form.get('grant_type') !== 'authorization_code') {
      sendJson(res, 400, { error: 'unsupported_grant_type' });
      return;
    }
    if (form.get('client_id') !== options.clientId || form.get('client_secret') !== options.clientSecret) {
      sendJson(res, 401, { error: 'invalid_client' });
      return;
    }
    const code = form.get('code') ?? '';
    const pending = codes.get(code);
    if (!pending) {
      sendJson(res, 400, { error: 'invalid_grant', error_description: 'unknown or used code' });
      return;
    }
    // Authorization codes are single-use.
    codes.delete(code);

    if (form.get('redirect_uri') !== pending.redirectUri) {
      sendJson(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' });
      return;
    }

    // PKCE: if a challenge was bound at /authorize, require a matching verifier.
    if (pending.codeChallenge) {
      const verifier = form.get('code_verifier');
      if (!verifier || s256(verifier) !== pending.codeChallenge) {
        sendJson(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' });
        return;
      }
    }

    const idToken = await mintIdToken(pending);
    sendJson(res, 200, {
      access_token: base64url(randomBytes(24)),
      token_type: 'Bearer',
      expires_in: idTokenTtlSec,
      id_token: idToken,
      scope: 'openid email',
    });
  }

  const handler = async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', issuer);
      const route = `${req.method} ${url.pathname}`;

      switch (route) {
        case 'GET /.well-known/openid-configuration':
          sendJson(res, 200, discovery());
          return;
        case 'GET /jwks':
          sendJson(res, 200, { keys: [publicJwk] });
          return;
        case 'GET /authorize':
          handleAuthorize(url, res);
          return;
        case 'POST /token':
          await handleToken(req, res);
          return;
        default:
          sendJson(res, 404, { error: 'not_found' });
      }
    } catch (err) {
      sendJson(res, 500, { error: 'server_error', error_description: (err as Error).message });
    }
  };

  const server: Server = options.tls
    ? createHttpsServer({ key: options.tls.key, cert: options.tls.cert }, (req, res) => void handler(req, res))
    : createHttpServer((req, res) => void handler(req, res));

  let boundPort = 0;

  return {
    server,
    get port() {
      return boundPort;
    },
    listen(port = 0, host = '0.0.0.0'): Promise<number> {
      return new Promise<number>((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          const addr = server.address();
          boundPort = typeof addr === 'object' && addr ? addr.port : port;
          server.removeListener('error', reject);
          resolve(boundPort);
        });
      });
    },
    close(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
