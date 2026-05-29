/**
 * @module @kb-labs/core-contracts/identity-provider
 *
 * The single public extension seam for authentication (ADR-0020,
 * principle #2).
 *
 * An identity provider verifies "this caller is `alice@acme.com`" and
 * nothing else. Everything downstream — looking up the local `User`
 * record, issuing tokens, creating session families, mapping to
 * memberships — stays inside the gateway. That asymmetry is the whole
 * point: replacing the door does not require rewriting the building.
 *
 * The built-in `email-password` provider implements this exact
 * contract; future Google/Okta/LDAP/SAML providers ship as additional
 * implementations without touching gateway internals.
 */

/**
 * Result of a single authentication attempt.
 *
 * On success, the provider only returns the canonical identity hints —
 * `email` is the join key to our internal `users` collection, and
 * `externalId` is whatever stable id the upstream IdP uses (its own
 * subject claim). On failure, `reason` is purposefully coarse: the
 * caller maps every failure mode to the same opaque `invalid_credentials`
 * response (ADR-0020, CD-8) to defend against email enumeration and
 * timing attacks.
 */
export type IdentityResult =
  | {
    ok: true;
    /** Canonical email (lowercased+trimmed by the provider, CD-4). */
    email: string;
    /** Stable opaque id from the upstream IdP, if any. */
    externalId?: string;
    /** Free-form attributes the upstream IdP may surface for ABAC use later. */
    attributes?: Record<string, unknown>;
  }
  | {
    ok: false;
    /**
     * - `invalid` — credentials format ok but didn't match.
     * - `disabled` — caller exists but the upstream marks them disabled.
     * - `unknown` — caller does not exist upstream.
     *
     * Callers must treat all three identically in user-facing responses
     * (CD-8). The distinction is for **internal logging only**.
     */
    reason: 'invalid' | 'disabled' | 'unknown';
  };

/**
 * Common members shared by every provider regardless of `kind`.
 *
 * `authenticate` lives here (and therefore on BOTH union members) on
 * purpose: a TypeScript union of object types intersects the parameter
 * types of methods that differ between members, so keeping
 * `authenticate(input: unknown)` identical on every member preserves the
 * ability to call `provider.authenticate(unknown)` on the union without
 * narrowing first (ADR-0020, DD-1).
 */
interface IdentityProviderBase {
  /**
   * Stable identifier registered with the provider registry. Surfaces as
   * `providerId` in `POST /auth/login`. Example values: `email-password`,
   * `google`, `okta`.
   */
  readonly id: string;

  /**
   * Verify a single authentication attempt.
   *
   * `input` shape is provider-specific. For `kind: 'password'` it is
   * typically `{ email, password }`. For `kind: 'redirect'` it is the
   * provider-specific callback payload (authorization code + the stored
   * per-attempt session) after the user returned from the upstream IdP.
   *
   * Providers must:
   * - Lowercase + trim emails before any lookup (CD-4).
   * - Run a dummy compare on unknown-user paths so success and failure
   *   take comparable time (CD-8 — enforced in the email-password
   *   provider's tests; ports of this contract must do the same).
   * - Never throw on bad credentials; throws are reserved for genuine
   *   infrastructure errors (DB down, upstream IdP 5xx).
   */
  authenticate(input: unknown): Promise<IdentityResult>;
}

/**
 * A provider that authenticates with credentials presented directly to
 * the gateway (e.g. email + password). Studio renders a credential form.
 */
export interface IPasswordIdentityProvider extends IdentityProviderBase {
  readonly kind: 'password';
}

/**
 * Context the gateway hands a redirect provider when a browser begins an
 * authorization flow (`GET /auth/oauth/:id/start`).
 */
export interface RedirectStartContext {
  /**
   * Opaque anti-CSRF / correlation token the gateway minted and persisted
   * in its OAuth state store. The provider embeds it in the upstream
   * authorize URL (`state` query param) verbatim.
   */
  state: string;
  /**
   * Absolute callback URL the upstream IdP must redirect back to, derived
   * from the inbound request Host:
   * `https://{host}/api/auth/oauth/{id}/callback`.
   */
  redirectUri: string;
}

/**
 * What a redirect provider returns when starting an authorization flow.
 */
export interface RedirectStartResult {
  /**
   * Absolute URL on the upstream IdP. The gateway answers the browser
   * with `302 Location: <redirectUrl>`.
   */
  redirectUrl: string;
  /**
   * Per-attempt secrets the provider needs back at the callback to finish
   * verification (OIDC `nonce`, PKCE `code_verifier`, ...). The gateway
   * persists this opaque blob alongside the state token and returns it to
   * `authenticate` at callback time. Never logged.
   */
  session?: Record<string, unknown>;
}

/**
 * A provider that delegates authentication to an upstream IdP via a
 * browser redirect (OAuth 2.0 / OIDC / SAML). Studio renders a
 * "Continue with X" button.
 */
export interface IRedirectIdentityProvider extends IdentityProviderBase {
  readonly kind: 'redirect';

  /**
   * Begin an authorization flow. Pure URL construction + per-attempt
   * secret generation — no network call. The gateway persists
   * `result.session` keyed by `ctx.state`, sets a state cookie, and 302s
   * the browser to `result.redirectUrl`.
   */
  startAuthorization(ctx: RedirectStartContext): Promise<RedirectStartResult>;
}

/**
 * The provider contract.
 *
 * A discriminated union on `kind`. Narrow with `if (provider.kind ===
 * 'redirect')` to reach `startAuthorization`; `authenticate` is callable
 * on the union directly (DD-1).
 *
 * Implementations are stateless from the caller's perspective; they get
 * their dependencies (the narrow ports below, HTTP clients to upstream
 * IdPs) wired via the factory at registration time.
 */
export type IIdentityProvider =
  | IPasswordIdentityProvider
  | IRedirectIdentityProvider;

/**
 * Minimal read view of a local user, as a provider needs it.
 *
 * Deliberately a structural subset of the gateway's `User` so the
 * gateway's `UsersStore` satisfies {@link IdentityUserPort} without an
 * adapter, while a third-party provider package depends only on
 * `core/contracts` (never on gateway internals).
 */
export interface IdentityUserRecord {
  userId: string;
  tenantId: string;
  /** Canonical (lowercased + trimmed) email. */
  email: string;
  status: 'pending' | 'active' | 'disabled';
}

/**
 * Minimal read view of a stored credential.
 *
 * Structural subset of the gateway's `Credential`. `hash` is opaque to
 * this contract (bcrypt hash for email-password; anything for others).
 */
export interface IdentityCredentialRecord {
  userId: string;
  providerId: string;
  hash: string;
}

/**
 * Narrow read port over the users collection (DD-2). A provider may look
 * a user up by canonical email within its configured tenant; it may not
 * write, list, or mutate. Satisfied structurally by the gateway's
 * `UsersStore`.
 */
export interface IdentityUserPort {
  findByEmailTenant(
    email: string,
    tenantId: string,
  ): Promise<IdentityUserRecord | null>;
}

/**
 * Narrow read port over the credentials collection (DD-2). Satisfied
 * structurally by the gateway's `CredentialsStore`.
 */
export interface IdentityCredentialPort {
  getCredential(
    userId: string,
    providerId: string,
  ): Promise<IdentityCredentialRecord | null>;
}

/**
 * Structural minimum logger.
 *
 * Layer-0 `core/contracts` must not depend on `core-platform`'s
 * `ILogger`, so providers receive this three-method shape instead. A
 * real `ILogger` satisfies it structurally.
 */
export interface IdentityProviderLogger {
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Everything a provider factory receives at registration time (DD-2).
 *
 * The gateway loader builds this once per configured provider. Third-party
 * provider packages type their factory against this and nothing else.
 */
export interface IdentityProviderDeps {
  /** Narrow read port over users. */
  users: IdentityUserPort;
  /** Narrow read port over credentials. */
  credentials: IdentityCredentialPort;
  /** The single tenant this gateway instance serves (subdomain-per-tenant). */
  tenantId: string;
  /** bcrypt cost factor for password providers (ignored by redirect ones). */
  bcryptCost: number;
  /** Structural-minimum logger. */
  logger: IdentityProviderLogger;
  /**
   * Injected `fetch` for providers that talk to an upstream IdP. Defaults
   * to `globalThis.fetch` in the loader; tests inject a fake (DD-8).
   */
  fetch?: typeof globalThis.fetch;
}

/**
 * The factory every provider package exports (DD-2/DD-3).
 *
 * `TConfig` is the provider's own validated config slice (each provider
 * owns its zod schema). The gateway loader calls this with the parsed
 * config and the shared deps. Built-in providers (`email-password`,
 * `oidc`) are registered through factories of this exact shape.
 */
export type IdentityProviderFactory<TConfig = unknown> = (
  config: TConfig,
  deps: IdentityProviderDeps,
) => IIdentityProvider | Promise<IIdentityProvider>;
