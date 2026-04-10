/**
 * Resolve the current working directory from a CLI context-like object.
 * Falls back to the process cwd when the context does not provide one.
 */
export function getContextCwd(input: { cwd?: string } | undefined): string {
  if (input && typeof input.cwd === "string" && input.cwd.length > 0) {
    return input.cwd;
  }
  return process.cwd();
}


