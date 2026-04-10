import type { QAResults } from '@kb-labs/qa-contracts';
import type { ErrorGroup, QAErrorGroupsResponse } from '@kb-labs/qa-contracts';

/**
 * Extract an error pattern from raw error text.
 * Tries to identify ESLint rules, TS error codes, or common patterns.
 */
function extractPattern(errorText: string, checkType: string): string {
  if (checkType === 'lint') {
    // ESLint: look for rule names like "@typescript-eslint/no-explicit-any"
    const ruleMatch = errorText.match(/(\S+\/[\w-]+|no-[\w-]+)/);
    if (ruleMatch?.[1]) {return ruleMatch[1];}
  }

  if (checkType === 'typeCheck') {
    // TypeScript: look for error codes like "TS2345" or "error TS2345"
    const tsMatch = errorText.match(/TS(\d{4,5})/);
    if (tsMatch) {return `TS${tsMatch[1]}`;}
  }

  if (checkType === 'test') {
    // Test failures: look for "FAIL" + test file pattern
    const failMatch = errorText.match(/FAIL\s+(\S+)/);
    if (failMatch) {return `FAIL: ${failMatch[1]}`;}
  }

  if (checkType === 'build') {
    // Build: "Module not found", "Cannot find module"
    if (errorText.includes('Cannot find module')) {return 'Cannot find module';}
    if (errorText.includes('Module not found')) {return 'Module not found';}
  }

  // Fallback: first meaningful line (skip empty lines, trim)
  const firstLine = errorText.split('\n').find((l) => l.trim().length > 0)?.trim() ?? '';
  return firstLine.slice(0, 100) || 'Unknown error';
}

/**
 * Group errors from QA results by error pattern.
 * Packages with the same error pattern (e.g., same ESLint rule) are grouped together.
 */
export function groupErrors(results: QAResults): QAErrorGroupsResponse {
  const groupMap = new Map<string, ErrorGroup>();
  let ungrouped = 0;

  for (const ct of Object.keys(results)) {
    const check = results[ct]!;
    if (!check.errors) {continue;}

    for (const [pkgName, errorText] of Object.entries(check.errors)) {
      const pattern = extractPattern(errorText, ct);
      const key = `${ct}::${pattern}`;

      const existing = groupMap.get(key);
      if (existing) {
        existing.count++;
        existing.packages.push(pkgName);
      } else {
        groupMap.set(key, {
          pattern,
          count: 1,
          packages: [pkgName],
          checkType: ct,
          example: errorText.slice(0, 200),
        });
      }
    }
  }

  // Groups with count=1 are "ungrouped" (unique errors)
  const groups: ErrorGroup[] = [];
  for (const group of groupMap.values()) {
    if (group.count === 1) {
      ungrouped++;
    } else {
      groups.push(group);
    }
  }

  // Sort by count descending
  groups.sort((a, b) => b.count - a.count);

  return { groups, ungrouped };
}
