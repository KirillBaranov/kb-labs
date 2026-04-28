/**
 * Standard ESLint configuration template
 *
 * This is the canonical template for all @kb-labs packages.
 * DO NOT modify this file locally - it is synced from @kb-labs/devkit
 *
 * Customization guidelines:
 * - DevKit preset already includes all standard ignores
 * - Only add project-specific ignores if absolutely necessary
 * - Document why custom ignores are needed
 *
 * @see https://github.com/kb-labs/devkit#eslint-configuration
 */
import nodePreset from '@kb-labs/devkit/eslint/node.js';

export default [
  ...nodePreset,

  // Raise cognitive-complexity threshold for this package.
  // Several formatting/rendering utilities (command-runner, modern-format, format, etc.)
  // have inherently branchy logic that is correct and well-tested; refactoring them into
  // many small private helpers would reduce readability without improving correctness.
  // Threshold 50 is a safety net against genuinely unreadable new code.
  {
    rules: {
      'sonarjs/cognitive-complexity': ['warn', 50],
    },
  },
];
