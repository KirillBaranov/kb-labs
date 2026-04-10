/**
 * Normalize filesystem paths to POSIX (forward-slash) form.
 */
export function toPosixPath(input: string): string {
  return input.replace(/\\/g, "/");
}


