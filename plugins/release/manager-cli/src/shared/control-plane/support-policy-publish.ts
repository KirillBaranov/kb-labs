/**
 * Publishing `ReleaseSupportPolicy` through the same CAS primitives as the
 * channel pointer (execution PR 6: "Support policy публикуется теми же
 * CAS-примитивами, что pointer; CI не изменяет состав её списков — это
 * проверяется policy-тестом").
 *
 * ## Why this is a separate, deliberately anaemic function
 *
 * The support policy is the second and last mutable document in the system, and
 * it is the one with a *composition* — `supported`, `retired`,
 * `minimumSupported`. PR 4 derives that composition from the version ledger
 * under two invariants (monotonic minimum, no burned versions) that CI has no
 * way to evaluate: CI cannot read the ledger, and §6A.1.4 says it must not be
 * able to.
 *
 * So the enforcement is structural rather than a check. `publishSupportPolicy`
 * takes **bytes and a digest**. It has no parameter for a release id, a list, a
 * minimum, or a reason; there is no shape of call to it that adds or removes an
 * entry. The only thing it can do with a policy is put the exact bytes it was
 * handed at the exact digest it was authorised for, or refuse.
 *
 * The digest check is not redundant with that. It is what stops a *substituted*
 * policy — bytes that are a perfectly valid `ReleaseSupportPolicy` with a
 * different composition — from being published under an authorisation granted
 * for something else.
 */

import {
  ReleaseControlDiagnosticCode,
  ReleaseSupportPolicySchema,
  canonicalSha256,
  type ReleaseSupportPolicy,
} from '@kb-labs/release-manager-contracts';

import { ReleaseAdapterError, rejectingFailure } from './adapters.js';
import { supportPolicyKey, writeDocumentWithCas, type CasStore, type CasWriteOutcome } from './cas-store.js';

export function supportPolicySha256(policy: ReleaseSupportPolicy): string {
  return canonicalSha256(policy);
}

export function parseSealedSupportPolicy(body: string): ReleaseSupportPolicy {
  try {
    return ReleaseSupportPolicySchema.parse(JSON.parse(body));
  } catch (error) {
    throw rejectingFailure(`sealed support policy is not a valid kb.release-support/1 document: ${(error as Error).message}`);
  }
}

export interface PublishSupportPolicyInput {
  store: CasStore;
  /** The exact bytes the plugin sealed. Never re-serialised, never edited. */
  body: string;
  /** The digest those bytes were authorised under. */
  expectedSha256: string;
  /**
   * Digest of the policy currently published, from the authorising plan.
   * `null` asserts that no policy has been published yet; omitting it is only
   * legitimate outside an approved operation.
   */
  expectedPreviousSha256?: string | null;
}

/**
 * Publishes sealed support-policy bytes.
 *
 * Note what is *not* here: no `previous` policy is read in order to be merged,
 * no list is recomputed, and the monotonicity invariant is not re-derived. PR 4
 * already enforced it when the bytes were sealed; re-deriving it here would
 * require CI to hold the ledger, which is the exact ownership violation the
 * design forbids.
 */
export async function publishSupportPolicy(input: PublishSupportPolicyInput): Promise<CasWriteOutcome> {
  const policy = parseSealedSupportPolicy(input.body);
  const sha256 = supportPolicySha256(policy);
  if (sha256 !== input.expectedSha256) {
    throw new ReleaseAdapterError(
      `sealed support policy digests to ${sha256}, but publication was authorised for ${input.expectedSha256}. `
      + 'Refusing: CI publishes the exact approved document or nothing.',
      { retryable: false, code: ReleaseControlDiagnosticCode.EvidenceMismatch },
    );
  }

  return writeDocumentWithCas({
    store: input.store,
    key: supportPolicyKey(),
    body: input.body,
    sha256,
    ...(input.expectedPreviousSha256 !== undefined ? { expectedPreviousSha256: input.expectedPreviousSha256 } : {}),
    digestOf: body => supportPolicySha256(parseSealedSupportPolicy(body)),
  });
}
