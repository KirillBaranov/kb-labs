/**
 * Verification Module
 *
 * Anti-hallucination layer for Mind responses.
 * Verifies sources exist and fields are grounded in actual code.
 */

export {
  SourceVerifier,
  createSourceVerifier,
  extractCodeMentions,
  verifyMentionsInChunks,
  type SourceVerificationResult,
  type VerificationSummary,
  type SourceVerifierOptions,
} from './source-verifier';

export {
  FieldChecker,
  createFieldChecker,
  hasLikelyHallucinations,
  type FieldCheckResult,
  type FieldCheckerOptions,
} from './field-checker';
