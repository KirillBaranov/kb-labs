/**
 * @module @kb-labs/gateway-auth/user-auth-service
 *
 * Orchestration layer for the user authentication flow (ADR-0020,
 * Phase 1.15).
 *
 * Pulls together every store + provider + jwt + policy and exposes the
 * five operations the HTTP layer calls:
 *
 * - `login`
 * - `refresh`     (CD-1 enforced here — disabled user revokes family)
 * - `logout`
 * - `changePassword` (revokes other families, keeps current)
 * - `activate`    (consumes invite, auto-logs in)
 *
 * All not-ok paths throw `AuthError(code)`. The HTTP layer collapses
 * most codes to opaque `invalid_credentials` for the caller; `code` is
 * preserved for logs and tests.
 */

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { UsersStore, User } from './users-store.js';
import { canonicalizeEmail } from './users-store.js';
import type { CredentialsStore } from './credentials-store.js';
import type { MembershipsStore } from './memberships-store.js';
import type { InvitesStore } from './invites-store.js';
import type {
  SessionsStore} from './sessions-store.js';
import {
  RefreshExpiredError,
  RefreshNotFoundError,
  RefreshReuseDetectedError,
} from './sessions-store.js';
import type { ProviderRegistry } from './provider-registry.js';
import type { PasswordPolicy, ValidationResult } from './password-policy.js';
import {
  type JwtConfig,
  signUserAccessToken,
  signUserRefreshToken,
  verifyUserRefreshToken,
} from './jwt.js';
import { issueCsrfToken } from './csrf.js';

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'unknown_provider'
  | 'invalid_refresh'
  | 'refresh_reuse'
  | 'user_disabled'
  | 'invalid_current_password'
  | 'weak_password'
  | 'invalid_invite';

export class AuthError extends Error {
  public override readonly name = 'AuthError';
  constructor(public readonly code: AuthErrorCode, public readonly reason?: string) {
    super(code);
  }
}

export interface UserAuthServiceOptions {
  users: UsersStore;
  credentials: CredentialsStore;
  memberships: MembershipsStore;
  invites: InvitesStore;
  sessions: SessionsStore;
  providers: ProviderRegistry;
  passwordPolicy: PasswordPolicy;
  jwtConfig: JwtConfig;
  accessTtlSec: number;
  refreshTtlSec: number;
  bcryptCost: number;
  /** Override for tests. Defaults to Date.now. */
  now?: () => number;
}

export interface PublicUser {
  userId: string;
  email: string;
  tenantId: string;
}

export interface TokenInfo {
  token: string;
  expiresInSec: number;
}

export interface SessionResult {
  user: PublicUser;
  access: TokenInfo;
  refresh: TokenInfo;
  csrf: string;
  familyId: string;
}

export interface LoginInput {
  providerId: string;
  input: unknown;
}

export interface DeviceCtx {
  userAgent?: string;
  ip?: string;
}

export interface ChangePasswordInput {
  userId: string;
  currentFamilyId: string;
  currentPassword: string;
  newPassword: string;
}

export interface ActivateInput {
  activationToken: string;
  password: string;
  deviceCtx: DeviceCtx;
}

const toPublicUser = (u: User): PublicUser => ({
  userId: u.userId,
  email: u.email,
  tenantId: u.tenantId,
});

const mapPolicyResultToError = (r: ValidationResult): AuthError | null => {
  if (r.ok) {return null;}
  return new AuthError('weak_password', r.reason);
};

export const createUserAuthService = (opts: UserAuthServiceOptions) => {
  const now = opts.now ?? Date.now;

  /**
   * Build the (access, refresh, csrf) triple. The caller passes the
   * `refreshJti` that sessions-store already minted so JWT and store
   * agree on the same identifier. Access has its own independent jti.
   */
  const issueSessionTokens = async (
    userId: string,
    tenantId: string,
    familyId: string,
    refreshJti: string,
  ): Promise<{ access: TokenInfo; refresh: TokenInfo; csrf: string }> => {
    const access = await signUserAccessToken(
      { userId, tenantId, familyId, ttlSec: opts.accessTtlSec },
      opts.jwtConfig,
    );
    const refresh = await signUserRefreshToken(
      { userId, tenantId, familyId, ttlSec: opts.refreshTtlSec, jti: refreshJti },
      opts.jwtConfig,
    );
    return {
      access: { token: access.token, expiresInSec: opts.accessTtlSec },
      refresh: { token: refresh, expiresInSec: opts.refreshTtlSec },
      csrf: issueCsrfToken(),
    };
  };

  // ── login ─────────────────────────────────────────────────────────
  const login = async (
    input: LoginInput,
    tenantId: string,
    deviceCtx: DeviceCtx,
  ): Promise<SessionResult> => {
    const provider = opts.providers.get(input.providerId);
    if (!provider) {
      throw new AuthError('unknown_provider');
    }

    const result = await provider.authenticate(input.input);
    if (!result.ok) {
      throw new AuthError('invalid_credentials');
    }

    // Provider says ok — pin to a User in OUR tenant. Provider has
    // already checked status=active for the local provider; remote
    // IdPs in the future will not, so we re-check here.
    const user = await opts.users.findByEmailTenant(canonicalizeEmail(result.email), tenantId);
    if (!user || user.status !== 'active') {
      throw new AuthError('invalid_credentials');
    }

    const sess = await opts.sessions.createSession({
      userId: user.userId,
      tenantId,
      deviceCtx,
    });

    const tokens = await issueSessionTokens(user.userId, tenantId, sess.familyId, sess.refreshJti);
    return { user: toPublicUser(user), ...tokens, familyId: sess.familyId };
  };

  // ── refresh ───────────────────────────────────────────────────────
  const refresh = async (refreshToken: string): Promise<SessionResult> => {
    const payload = await verifyUserRefreshToken(refreshToken, opts.jwtConfig);
    if (!payload) {
      throw new AuthError('invalid_refresh');
    }

    // CD-1: middleware checks user.status on every request, but the
    // refresh endpoint is public (no access cookie to inspect). Check
    // again here so a disabled user cannot extend their session via a
    // still-live refresh cookie.
    const user = await opts.users.getById(payload.userId);
    if (!user || user.status !== 'active') {
      // Revoke whatever family they presented so the dead refresh is
      // also gone from the store.
      await opts.sessions.revokeFamily(payload.familyId);
      throw new AuthError('user_disabled');
    }

    let rotated;
    try {
      rotated = await opts.sessions.rotateRefresh(payload.jti);
    } catch (err) {
      if (err instanceof RefreshReuseDetectedError) {throw new AuthError('refresh_reuse');}
      if (err instanceof RefreshExpiredError) {throw new AuthError('invalid_refresh');}
      if (err instanceof RefreshNotFoundError) {throw new AuthError('invalid_refresh');}
      throw err;
    }

    const tokens = await issueSessionTokens(user.userId, user.tenantId, rotated.familyId, rotated.newJti);
    return { user: toPublicUser(user), ...tokens, familyId: rotated.familyId };
  };

  // ── logout ────────────────────────────────────────────────────────
  const logout = async (refreshToken: string): Promise<void> => {
    const payload = await verifyUserRefreshToken(refreshToken, opts.jwtConfig);
    if (!payload) {return;} // idempotent for garbage tokens
    await opts.sessions.revokeFamily(payload.familyId);
  };

  // ── changePassword ────────────────────────────────────────────────
  const changePassword = async (input: ChangePasswordInput): Promise<void> => {
    const user = await opts.users.getById(input.userId);
    if (!user || user.status !== 'active') {
      // Treat as a credentials problem from the caller's POV — they
      // shouldn't be reaching this endpoint as a disabled user anyway.
      throw new AuthError('invalid_current_password');
    }

    const cred = await opts.credentials.getCredential(user.userId, 'email-password');
    if (!cred) {
      throw new AuthError('invalid_current_password');
    }
    const ok = await bcrypt.compare(input.currentPassword, cred.hash);
    if (!ok) {throw new AuthError('invalid_current_password');}

    const policyResult = await opts.passwordPolicy.validate(input.newPassword);
    const polErr = mapPolicyResultToError(policyResult);
    if (polErr) {throw polErr;}

    const hash = await bcrypt.hash(input.newPassword, opts.bcryptCost);
    await opts.credentials.setCredential({
      userId: user.userId,
      providerId: 'email-password',
      hash,
    });

    // Kill every other device — the security expectation around a
    // password change is "all my other sessions are gone now".
    await opts.sessions.revokeAllUserSessionsExcept(user.userId, input.currentFamilyId);
  };

  // ── activate ──────────────────────────────────────────────────────
  const activate = async (input: ActivateInput): Promise<SessionResult> => {
    const invite = await opts.invites.findByToken(input.activationToken);
    if (!invite) {throw new AuthError('invalid_invite');}

    const policyResult = await opts.passwordPolicy.validate(input.password);
    const polErr = mapPolicyResultToError(policyResult);
    if (polErr) {throw polErr;}

    // Create the user, credential, and membership. We never touch
    // pre-existing records — the invites store enforces no-duplicate-
    // active so a stray re-use would have been rejected at issuance.
    const userId = randomUUID();
    await opts.users.create({
      userId,
      tenantId: invite.tenantId,
      email: invite.email,
      status: 'active',
    });
    const hash = await bcrypt.hash(input.password, opts.bcryptCost);
    await opts.credentials.setCredential({
      userId,
      providerId: 'email-password',
      hash,
    });
    await opts.memberships.addMembership({
      userId,
      tenantId: invite.tenantId,
      groupId: invite.groupId,
    });
    await opts.invites.consume(invite.inviteId);

    const sess = await opts.sessions.createSession({
      userId,
      tenantId: invite.tenantId,
      deviceCtx: input.deviceCtx,
    });

    const tokens = await issueSessionTokens(userId, invite.tenantId, sess.familyId, sess.refreshJti);
    return {
      user: { userId, email: invite.email, tenantId: invite.tenantId },
      ...tokens,
      familyId: sess.familyId,
    };
  };

  void now; // Reserved for future audit-event timestamps; currently unused.

  return { login, refresh, logout, changePassword, activate };
};
