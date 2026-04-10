/**
 * Main exports for @kb-labs/shared-cli-ui
 */

export * from './colors';
export * from './loader';
export * from './format';
export * from './command-output';
export * from './timing-tracker';
export * from './command-suggestions';
export * from './command-discovery';
export * from './manifest-parser';
export * from './multi-cli-suggestions';
export * from './dynamic-command-discovery';
export * from './artifacts-display';
export * from './table';
export * from './debug';
export * from './command-runner';
export * from './utils/flags';
export * from './utils/env';
export * from './utils/context';
export * from './utils/path';

// Modern UI Kit (new) - selective exports to avoid conflicts
export {
  sideBorderBox,
  sectionHeader,
  metricsList,
  statusLine,
  formatCommandHelp,
  type SideBorderBoxOptions,
  type SectionContent,
} from './modern-format';
export * from './command-result';
