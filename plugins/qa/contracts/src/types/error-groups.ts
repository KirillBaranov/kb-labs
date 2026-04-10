// CheckType is now `string`

/**
 * A group of packages sharing the same error pattern.
 */
export interface ErrorGroup {
  /** Error pattern identifier (e.g. ESLint rule, TS error code) */
  pattern: string;
  /** Number of packages with this error */
  count: number;
  /** Package names in this group */
  packages: string[];
  /** Which check type this group belongs to */
  checkType: string;
  /** Example error text (first 200 chars) */
  example: string;
}

/**
 * Grouped errors from the last QA run.
 */
export interface QAErrorGroupsResponse {
  /** Error groups sorted by count descending */
  groups: ErrorGroup[];
  /** Number of packages with unique (ungrouped) errors */
  ungrouped: number;
}
