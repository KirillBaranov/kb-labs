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
 * The provider contract.
 *
 * Implementations are stateless from the caller's perspective; they get
 * their dependencies (users-store, credentials-store, HTTP clients to
 * upstream IdPs) wired via constructor / DI at registration time.
 */
export interface IIdentityProvider {
  /**
   * Stable identifier registered with the provider registry. Surfaces as
   * `providerId` in `POST /auth/login`. Example values: `email-password`,
   * `google`, `okta`.
   */
  readonly id: string;

  /**
   * UX hint for the login page. Studio renders a credential form for
   * `password` and a "Continue with X" button for `redirect` providers
   * (OAuth/SAML). The gateway does not change behaviour based on this —
   * it's purely metadata for `GET /auth/providers`.
   */
  readonly kind: 'password' | 'redirect';

  /**
   * Verify a single authentication attempt.
   *
   * `input` shape is provider-specific. For `kind: 'password'` it is
   * typically `{ email, password }`. For `kind: 'redirect'` it is the
   * provider-specific callback payload after the user returned from the
   * upstream IdP.
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
