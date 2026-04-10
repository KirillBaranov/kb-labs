/**
 * Runtime API for V3 Plugin System
 *
 * Sandboxed runtime capabilities: filesystem, network, environment.
 * All operations are permission-checked before execution.
 */

/**
 * File/directory stats
 */
export interface FileStat {
  /**
   * Check if path is a file
   */
  isFile(): boolean;

  /**
   * Check if path is a directory
   */
  isDirectory(): boolean;

  /**
   * File size in bytes
   */
  size: number;

  /**
   * Last modified time (ms since epoch)
   */
  mtime: number;

  /**
   * Created time (ms since epoch)
   */
  ctime: number;
}

/**
 * Directory entry
 */
export interface DirEntry {
  /**
   * Entry name (without path)
   */
  name: string;

  /**
   * Whether entry is a file
   */
  isFile: boolean;

  /**
   * Whether entry is a directory
   */
  isDirectory: boolean;
}

/**
 * Options for mkdir
 */
export interface MkdirOptions {
  /**
   * Create parent directories if they don't exist
   */
  recursive?: boolean;
}

/**
 * Options for rm
 */
export interface RmOptions {
  /**
   * Remove directories and their contents recursively
   */
  recursive?: boolean;

  /**
   * Don't throw if path doesn't exist
   */
  force?: boolean;
}

/**
 * Options for writeFile
 */
export interface WriteFileOptions {
  /**
   * File encoding (default: utf-8)
   */
  encoding?: BufferEncoding;

  /**
   * Append instead of overwrite
   */
  append?: boolean;
}

/**
 * Options for glob
 */
export interface GlobOptions {
  /**
   * Current working directory for pattern matching
   */
  cwd?: string;

  /**
   * Patterns to ignore
   */
  ignore?: string[];

  /**
   * Return absolute paths instead of relative
   */
  absolute?: boolean;

  /**
   * Follow symbolic links
   */
  followSymlinks?: boolean;
}

/**
 * Sandboxed filesystem operations
 *
 * All paths are relative to cwd (unless absolute).
 * Paths outside allowed directories will throw PermissionError.
 */
export interface FSShim {
  /**
   * Read file contents as string
   *
   * @param path File path (relative to cwd or absolute)
   * @param encoding Encoding (default: utf-8)
   */
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;

  /**
   * Read file contents as Buffer
   *
   * @param path File path (relative to cwd or absolute)
   */
  readFileBuffer(path: string): Promise<Uint8Array>;

  /**
   * Write content to file
   *
   * Creates parent directories if they don't exist.
   *
   * @param path File path (relative to cwd or absolute)
   * @param content Content to write
   * @param options Write options
   */
  writeFile(
    path: string,
    content: string | Uint8Array,
    options?: WriteFileOptions
  ): Promise<void>;

  /**
   * Read directory contents
   *
   * @param path Directory path
   */
  readdir(path: string): Promise<string[]>;

  /**
   * Read directory contents with stats
   *
   * @param path Directory path
   */
  readdirWithStats(path: string): Promise<DirEntry[]>;

  /**
   * Get file/directory stats
   *
   * @param path Path to stat
   */
  stat(path: string): Promise<FileStat>;

  /**
   * Check if path exists
   *
   * @param path Path to check
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create directory
   *
   * @param path Directory path
   * @param options Options (recursive, etc.)
   */
  mkdir(path: string, options?: MkdirOptions): Promise<void>;

  /**
   * Remove file or directory
   *
   * @param path Path to remove
   * @param options Options (recursive, force)
   */
  rm(path: string, options?: RmOptions): Promise<void>;

  /**
   * Copy file or directory
   *
   * @param src Source path
   * @param dest Destination path
   */
  copy(src: string, dest: string): Promise<void>;

  /**
   * Move/rename file or directory
   *
   * @param src Source path
   * @param dest Destination path
   */
  move(src: string, dest: string): Promise<void>;

  /**
   * Find files matching glob pattern
   *
   * @param pattern Glob pattern (e.g., "**​/*.ts", "src/**​/*.{ts,tsx}")
   * @param options Glob options (cwd, ignore, etc.)
   */
  glob(pattern: string, options?: GlobOptions): Promise<string[]>;

  /**
   * Resolve path relative to cwd
   *
   * Does NOT check permissions - just resolves the path.
   *
   * @param path Path to resolve
   */
  resolve(path: string): string;

  /**
   * Get relative path from cwd
   *
   * @param path Absolute path
   */
  relative(path: string): string;

  /**
   * Join path segments
   */
  join(...segments: string[]): string;

  /**
   * Get directory name of a path
   */
  dirname(path: string): string;

  /**
   * Get base name of a path
   */
  basename(path: string, ext?: string): string;

  /**
   * Get extension of a path
   */
  extname(path: string): string;
}

/**
 * Sandboxed fetch (network whitelist)
 *
 * Only URLs matching the allowed patterns can be fetched.
 * Throws PermissionError for non-whitelisted URLs.
 */
export type FetchShim = typeof globalThis.fetch;

/**
 * Sandboxed environment variable access
 *
 * Only whitelisted env vars can be read.
 * Non-whitelisted vars return undefined (no error).
 *
 * Always allowed: NODE_ENV, CI, DEBUG
 */
export type EnvShim = (key: string) => string | undefined;

/**
 * Runtime API interface
 *
 * Provides sandboxed access to system resources.
 */
export interface RuntimeAPI {
  /**
   * Sandboxed filesystem operations
   */
  readonly fs: FSShim;

  /**
   * Sandboxed fetch (network whitelist)
   */
  readonly fetch: FetchShim;

  /**
   * Sandboxed environment variables
   */
  readonly env: EnvShim;
}
