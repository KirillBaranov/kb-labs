export interface FindNearestConfigOpts {
    startDir?: string;
    stopDir?: string;             // stop climbing at/before this dir (e.g., repo root)
    filenames: string[];          // e.g., [".kb-labsrc.json", ".sentinelrc.json"]
}

export interface SubRepo {
  /** Relative path from repoRoot, e.g. "platform/kb-labs-core" */
  path: string;
  /** Parent segment(s) — e.g. "platform"; empty string for flat layout */
  category: string;
  /** Final directory name — e.g. "kb-labs-core" */
  name: string;
  /** Absolute path on disk — convenience; equals path.join(repoRoot, path) */
  absolutePath: string;
}