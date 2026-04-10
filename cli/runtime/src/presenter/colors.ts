import { bold, dim, gray, green, red, yellow, cyan, blue } from "colorette";

/**
 * Color utilities for CLI output
 * All functions respect NO_COLOR environment variable (handled by colorette)
 */
export const colors = {
  bold,
  dim,
  gray,
  green,
  red,
  yellow,
  cyan,
  blue,
} as const;

// Export individual functions for convenience
export { bold, dim, gray, green, red, yellow, cyan, blue };
