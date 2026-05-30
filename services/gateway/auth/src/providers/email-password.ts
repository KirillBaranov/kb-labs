/**
 * @module @kb-labs/gateway-auth/providers/email-password
 *
 * Built-in identity provider for the local email-password flow
 * (ADR-0020, Phase 1.10). Implements `IIdentityProvider` exactly as a
 * future Google/Okta provider would — `email-password` has no special
 * status beyond being the one we ship.
 *
 * Two design notes worth keeping in mind:
 *
 * - **Constant-time response (CD-8).** Every not-ok path runs a real
 *   bcrypt compare against a fixed dummy hash. Without this, a missing
 *   user returns in microseconds while a wrong-password attempt takes
 *   ~hundreds of milliseconds — a textbook user-enumeration timing
 *   channel. The discriminated `reason` is for **logs only**; the HTTP
 *   layer collapses it to a single opaque "invalid_credentials".
 *
 * - **No `setCredential` here.** This provider only *reads* credentials.
 *   The activation flow writes the hash via the service layer, which
 *   chooses the bcrypt cost from config. Keeping write logic out of
 *   the provider means future Google/Okta providers don't carry a
 *   meaningless `setCredential` method.
 */

import bcrypt from 'bcryptjs';
import type {
  IIdentityProvider,
  IdentityResult,
  IdentityUserPort,
  IdentityCredentialPort,
} from '@kb-labs/core-contracts';
import { canonicalizeEmail } from '../users-store.js';

export interface EmailPasswordProviderOptions {
  /**
   * Narrow read port over users (DD-2). The gateway's `UsersStore`
   * satisfies this structurally; the provider only ever reads.
   */
  users: IdentityUserPort;
  /** Narrow read port over credentials (DD-2). */
  credentials: IdentityCredentialPort;
  /** The tenant this provider instance authenticates against. */
  tenantId: string;
  /** bcrypt cost used for the dummy compare timing. Should match the
   *  cost used by the activation flow so dummy/real timings are similar. */
  bcryptCost: number;
}

/**
 * A pre-computed bcrypt hash used for the dummy compare on every
 * not-ok path. The actual plaintext is irrelevant — what matters is
 * that `bcrypt.compare` runs against a real hash of the right cost.
 *
 * NOTE: This is computed lazily once per provider instance from the
 * configured `bcryptCost` so dummy hashes match the cost the
 * activation flow will produce.
 */
const dummyHashFor = (cost: number): Promise<string> =>
  bcrypt.hash('dummy-password-for-timing', cost);

interface PasswordInput {
  email: string;
  password: string;
}

const isPasswordInput = (raw: unknown): raw is PasswordInput => {
  if (!raw || typeof raw !== 'object') {return false;}
  const r = raw as Record<string, unknown>;
  return typeof r.email === 'string' && typeof r.password === 'string'
    && r.email.length > 0 && r.password.length > 0;
};

export const createEmailPasswordProvider = (
  opts: EmailPasswordProviderOptions,
): IIdentityProvider => {
  // Compute the dummy hash once; reused on every not-ok path.
  const dummyHashPromise = dummyHashFor(opts.bcryptCost);

  return {
    id: 'email-password',
    kind: 'password',

    async authenticate(input: unknown): Promise<IdentityResult> {
      if (!isPasswordInput(input)) {
        // Even on shape-invalid input, do a dummy bcrypt so timing
        // does not give away "well-formed vs malformed payload".
        await bcrypt.compare('x', await dummyHashPromise);
        return { ok: false, reason: 'invalid' };
      }

      const email = canonicalizeEmail(input.email);
      const user = await opts.users.findByEmailTenant(email, opts.tenantId);

      if (!user) {
        await bcrypt.compare(input.password, await dummyHashPromise);
        return { ok: false, reason: 'unknown' };
      }

      if (user.status !== 'active') {
        await bcrypt.compare(input.password, await dummyHashPromise);
        return { ok: false, reason: 'disabled' };
      }

      const cred = await opts.credentials.getCredential(user.userId, 'email-password');
      if (!cred) {
        await bcrypt.compare(input.password, await dummyHashPromise);
        return { ok: false, reason: 'unknown' };
      }

      const match = await bcrypt.compare(input.password, cred.hash);
      if (!match) {
        return { ok: false, reason: 'invalid' };
      }

      return { ok: true, email: user.email, externalId: user.userId };
    },
  };
};
