/**
 * Canonical error codes for every policy violation type.
 *
 * Attach `code` to a `PolicyViolation` to enable programmatic discrimination
 * of violation kinds without parsing free-form message strings.
 *
 * All codes share the `POLICY_` prefix so they are unambiguous when mixed
 * with error codes from other subsystems.
 */
export const PolicyErrorCode = {
  /**
   * A package depends on another package that belongs to a category outside
   * the set of categories permitted for the depending package's own category.
   * Produced by the `boundary-check` rule.
   */
  BOUNDARY_VIOLATION: 'POLICY_BOUNDARY_VIOLATION',

  /**
   * A plugin package imports an internal platform package directly instead of
   * going through `@kb-labs/sdk`. Plugin packages must restrict their
   * `@kb-labs/*` dependencies exclusively to `@kb-labs/sdk`.
   * Produced by the `sdk-only-deps` rule.
   */
  SDK_ONLY_DEP_VIOLATION: 'POLICY_SDK_ONLY_DEP_VIOLATION',

  /**
   * The local `package.json` version is lower than the version already
   * published to the npm registry. Published versions may never be decreased.
   * Produced by the `no-rollback` rule.
   */
  VERSION_ROLLBACK: 'POLICY_VERSION_ROLLBACK',

  /**
   * One or more previously exported public symbols have been removed without
   * a corresponding major-version bump, constituting a breaking API change.
   * Produced by the `api-compat-check` / `no-breaking-without-major` rules.
   */
  API_BREAKING_CHANGE: 'POLICY_API_BREAKING_CHANGE',

  /**
   * A policy configuration references a rule name that has no registered
   * check implementation. The rule will be skipped at runtime.
   * Produced by the policy runner when an unknown rule key is encountered.
   */
  UNKNOWN_RULE: 'POLICY_UNKNOWN_RULE',
} as const;

/**
 * Union type of all valid `PolicyErrorCode` string values.
 * Use this as the type for `PolicyViolation.code`.
 */
export type PolicyErrorCode = (typeof PolicyErrorCode)[keyof typeof PolicyErrorCode];

/**
 * Human-readable descriptions for each `PolicyErrorCode`.
 *
 * These are intended as stable reference messages for documentation,
 * tooling output, and IDE integrations. Individual violations also carry
 * a context-specific `message` and optional `detail` field on the
 * `PolicyViolation` object.
 */
export const POLICY_ERROR_MESSAGES: Readonly<Record<PolicyErrorCode, string>> = {
  [PolicyErrorCode.BOUNDARY_VIOLATION]:
    'A package depends on another package outside its allowed category boundaries. ' +
    'Each workspace category may only import packages from the explicitly permitted categories ' +
    'listed in the policy configuration.',

  [PolicyErrorCode.SDK_ONLY_DEP_VIOLATION]:
    'A plugin package imports an internal platform package directly instead of going through ' +
    '@kb-labs/sdk. Plugin packages must limit their @kb-labs/* dependencies to @kb-labs/sdk only. ' +
    'Move required types and utilities to the SDK or use its re-exports.',

  [PolicyErrorCode.VERSION_ROLLBACK]:
    'The local package.json version is lower than the version already published to the npm registry. ' +
    'Versions may never be decreased once published — restore the version to the published value or ' +
    'release a higher version.',

  [PolicyErrorCode.API_BREAKING_CHANGE]:
    'One or more previously exported symbols have been removed without a corresponding major-version ' +
    'bump. Either restore the removed symbols to preserve backward compatibility, or increment the ' +
    'major version before removing them.',

  [PolicyErrorCode.UNKNOWN_RULE]:
    'A policy rule reference was encountered that has no registered check implementation. ' +
    'Verify that the rule name in the policy configuration exactly matches a supported rule ' +
    'identifier (e.g. "sdk-only-deps", "boundary-check", "no-rollback", "api-compat-check").',
};

/**
 * Returns the stable descriptive message for a given `PolicyErrorCode`.
 *
 * @example
 * ```ts
 * const msg = getPolicyErrorMessage(PolicyErrorCode.BOUNDARY_VIOLATION);
 * // "A package depends on another package outside its allowed category boundaries. …"
 * ```
 */
export function getPolicyErrorMessage(code: PolicyErrorCode): string {
  return POLICY_ERROR_MESSAGES[code];
}
