/**
 * Source-file discovery via `globby` over the workspace filesystem.
 *
 * Reads the real repo relative to `cwd` — NOT the platform `storage` adapter,
 * which is a blob store that recurses into node_modules and chokes on pnpm
 * symlink chains. Ignores are applied as glob excludes and symlinks are not
 * followed, so dependency dirs are never traversed.
 *
 * Returns paths relative to `cwd`.
 */

import globby from 'globby';

const EXTENSIONS = 'ts,tsx,js,jsx,mjs,cjs,py,go,rs,java,rb,md,mdx,txt,json,yaml,yml,toml';

const IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.git/**',
  '**/.kb/**',
];

export async function discover(cwd: string, scope?: string): Promise<string[]> {
  const base = scope && scope !== '.' ? scope.replace(/\/+$/, '') : '';
  const pattern = base ? `${base}/**/*.{${EXTENSIONS}}` : `**/*.{${EXTENSIONS}}`;

  return globby(pattern, {
    cwd,
    ignore: IGNORE,
    dot: false,
    followSymbolicLinks: false,
    gitignore: false,
    onlyFiles: true,
  });
}
